# Code Architecture — dooray-cli

## 기술 스택

| 역할            | 선택                                  |
| --------------- | ------------------------------------- |
| 언어            | TypeScript (Node 18+)                 |
| CLI 프레임워크  | Commander.js                          |
| HTTP 클라이언트 | ky (fetch 기반, 경량)                 |
| 빌드            | tsup (esbuild, 단일 번들)             |
| 출력 포맷       | chalk (색상), cli-table3 (테이블)     |
| 로딩            | ora (스피너)                          |
| 대화형 프롬프트 | @inquirer/prompts (setup 마법사)      |
| 에디터 연동     | js-yaml (frontmatter), tmp (임시파일) |
| IMAP 클라이언트 | imapflow (메일 조회)                  |
| SMTP 클라이언트 | nodemailer (메일 발송)                |
| 메일 파서       | mailparser (메일 본문 파싱)           |

## 디렉터리 구조

```
src/
  index.ts                  # CLI entrypoint, Commander 루트 설정

  api/
    client.ts               # DoorayApiClient — ky 기반 HTTP 래퍼
    imapClient.ts           # IMAP 메일 조회 (imapflow + mailparser)
    smtpClient.ts           # SMTP 메일 발송 (nodemailer)
    types.ts                # 모든 API 요청/응답 타입

  resolvers/
    me.ts                   # /common/v1/members/me → CachedMe
    project.ts              # code·id → projectId
    member.ts               # name → organizationMemberId
    workflow.ts             # name·class → workflowId
    post.ts                 # postNumber → postId (API 호출)
    wiki.ts                 # projectCode → wikiId / wikiId → homePageId (캐시)

  cache/
    store.ts                # ~/.dooray/cache/ 디렉토리 기반 CRUD + TTL 체크
    types.ts                # CacheEntry·Cached* 인터페이스

  config/
    store.ts                # ~/.dooray/config.json CRUD
    types.ts                # Config 인터페이스

  editor/
    index.ts                # $EDITOR 실행 + YAML frontmatter 직렬화·파싱

  formatters/
    table.ts                # cli-table3 기반 테이블 출력
    post.ts                 # Post 전용 포맷 (workflow 이름 등)
    wiki.ts                 # Wiki 전용 포맷

  utils/
    errors.ts               # DoorayCliError (message + exitCode)
    spinner.ts              # ora 래퍼
    exit-codes.ts           # 0 성공 / 1 API오류 / 2 인증실패 / 3 파라미터오류 / 4 설정오류

  commands/
    setup.ts                # dooray setup — 대화형 초기 설정 마법사 (스킬 설치 포함)
    config.ts               # dooray config set|get
    doctor.ts               # dooray doctor
    cache.ts                # dooray cache clear|refresh

    project/
      list.ts
      members.ts
      workflows.ts

    post/
      list.ts
      search.ts
      get.ts
      create.ts
      edit.ts               # $EDITOR 기반
      done.ts
      workflow.ts
      comment/
        list.ts
        add.ts
        edit.ts
        delete.ts
      file/
        list.ts               # 첨부파일 목록
        download.ts           # 단일 파일 다운로드
        download-all.ts       # 전체 파일 다운로드
        upload.ts             # 파일 업로드
        delete.ts             # 파일 삭제

    wiki/
      list.ts
      pages.ts
      page-get.ts
      page-create.ts
      page-edit.ts          # $EDITOR 기반

    mail/
      list.ts               # 메일 목록 (--unread, --search)
      get.ts                # 메일 상세 조회
      send.ts               # 메일 발송 (--to, --cc, --bcc, --html)
      reply.ts              # 메일 답장 (In-Reply-To 스레드 유지)
```

## 모듈 의존 관계

```
commands/* → resolvers/* → cache/store + api/client
commands/* → formatters/*
commands/* → utils/errors
editor/    → api/client (현재 데이터 fetch) + resolvers/member
```

- `commands/setup.ts`는 config/store + api/client + @inquirer/prompts 의존 + fs(심볼릭 링크 생성)
- `api/client`는 순수 HTTP 래퍼. 비즈니스 로직 없음
- `resolvers/*`는 캐시 우선 조회, 만료 시 api/client 호출
- `commands/*`는 resolvers + api/client + formatters 조합

## API Client 구조

```typescript
class DoorayApiClient {
  constructor(apiKey: string, baseUrl: string);

  // 각 메서드는 ky 호출 + 에러 시 DoorayCliError throw
  getMe(): Promise<MemberDetailResponse>;
  getMemberDetail(memberId): Promise<MemberDetailResponse>;
  getProjects(params?): Promise<ProjectListResponse>;
  getPosts(projectId, params?): Promise<PostListResponse>;
  getPost(projectId, postId): Promise<PostDetailResponse>;
  createPost(projectId, body): Promise<CreatePostResponse>;
  updatePost(projectId, postId, body): Promise<void>;
  // ... (dooray-mcp-server DoorayClient 인터페이스와 1:1 대응)
}
```

## 커맨드 실행 흐름 (예: `dooray post done my-project 42`)

```
1. index.ts — Commander가 커맨드 파싱
2. commands/post/done.ts — 실행 진입
3. config/store.ts — apiKey, baseUrl 로드 (없으면 exitCode 4)
4. resolvers/project.ts — "my-project" → projectId
5. resolvers/post.ts — 42 → postId (API 호출)
6. api/client.ts — POST /project/v1/projects/{id}/posts/{id}/set-done
7. formatters/post.ts — 성공 메시지 출력
```

## 에러 처리 원칙

- 모든 에러는 `DoorayCliError(message, exitCode)` 로 통일
- `commands/*` 최상단에서 catch → stderr 출력 → `process.exit(exitCode)`
- API 4xx: exitCode 1, 인증 401/403: exitCode 2, 파라미터: exitCode 3, config 없음: exitCode 4

## 출력 원칙

- 기본: human-readable (테이블·포맷)
- `--json`: raw JSON (stdout, 파이프 친화)
- `--quiet`: ID만 출력 (스크립팅용)
- `--no-color`: 컬러 제거 (CI 환경, `NO_COLOR` env 자동 감지)
- 스피너·에러: stderr / 데이터: stdout (파이프 시 stderr 오염 방지)

## 빌드·배포

```json
// package.json 핵심
{
  "name": "@bifos/dooray-cli",
  "bin": { "dooray": "./dist/index.js" },
  "engines": { "node": ">=18" },
  "scripts": {
    "build": "tsup src/index.ts --format cjs --target node18 --banner.js '#!/usr/bin/env node'"
  }
}
```
