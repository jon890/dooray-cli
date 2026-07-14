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
    me.ts                   # /common/v1/members/me → CachedMe (id·name·orgId; orgId 없으면 캐시 갱신)
    project.ts              # code·id → projectId. 입력 자동 분기: numeric 15+자리 → cache 우회 + 그대로 반환 / 그 외 → cache 매칭 (code+id). 권한 검증은 후속 API 4xx 위임 (ADR-030, Issue #78)
    member.ts               # 입력 자동 분기: 15자리 숫자 / 이메일 / 이름. lookupMemberName + buildMemberNameMap (ADR-021)
    workflow.ts             # name·class → workflowId
    post.ts                 # postNumber → postId (API 호출)
    wiki.ts                 # projectCode → wikiId / wikiId → homePageId (캐시)
    postRef.ts              # "code/number" 또는 raw postId → postId (post create / post edit --parent 공용)
    tag.ts                  # name[] → tagIds + mandatory/selectOne 검증
    milestone.ts            # name → milestoneId
    match.ts                # 공용 매칭: 정확일치 → 부분일치 → 모호 시 에러. helpHint 옵션 + name 가드 (ADR-028)
    post-input.ts           # --id / --url / positional / Dooray URL → {projectId, postId, ...} 단일 헬퍼 (ADR-020). 입력 토큰 타입 판별 (classifyPostInputToken) + 진입점별 검증 (ADR-020 보강)
    comment-file-input.ts   # comment file 4개 명령 입력 분기 헬퍼 (parseCommentFilePositional pure + resolveCommentFileInput orchestrator, ADR-020 확장)
    task-link.ts            # --link-task ref[] → TaskLinkInput[] (resolvePostInput + getPost detail 합성, post create/edit 인라인 변환)
    member-group.ts         # projectId → CachedMemberGroup[] (캐시 우선). 응답 nested array 정규화 (`res.result.flat()`) + 입력 자동 분기 (15+자리 numeric → id 직접 / 그 외 → code matchByName) + 개별 code 누락 가드 (ADR-028, Issue #65 #76)
    post-users.ts           # parseUserSpec + mergeUsers + resolveUserAdditions — post edit/create 의 cc/to 멤버·그룹 입력 분기 + 기존 users 와 append/clear/dedupe (ADR-025)
    template.ts             # ensureTemplates + resolveTemplate (ADR-027, TTL 24h)
    post-tags.ts            # mergeTagIds pure helper — post edit 의 --tag/--tag-clear/--tag-remove 머지 (clear → remove → add → dedupe, Issue #66, ADR-019 확장)
    wiki-page-input.ts      # wiki page file 5 명령 입력 분기 (--id/--url/positional URL → {wikiId, pageId}, post-input.ts 패턴 mirror, ADR-020 확장)
    messenger-channel.ts    # messenger channel-send --channel 분기: channelId(15+자리) 직접 / 그 외 GET channels title 매칭 (ADR-033)

  cache/
    store.ts                # ~/.dooray/cache/ 디렉토리 기반 CRUD + TTL 체크
                            #   MEMBER_GROUPS_DIR = ~/.dooray/cache/member-groups/
    types.ts                # CacheEntry·Cached* 인터페이스
    last-run.ts             # ~/.dooray/last-run.json 단일 read/write (ADR-023, cache 디렉토리 외부 — cache clear 영향 없음)

  config/
    store.ts                # ~/.dooray/config.json CRUD
    types.ts                # Config 인터페이스

  editor/
    index.ts                # $EDITOR 실행 + YAML frontmatter 직렬화·파싱

  formatters/
    table.ts                # cli-table3 기반 테이블 출력
    post.ts                 # Post 전용 포맷 (workflow 이름 등)
    wiki.ts                 # Wiki 전용 포맷 (formatWikiTree — flat 배열 → parentPageId 로 트리 조립 후 ├─└─ 렌더, ADR-034)
    member.ts               # Member 상세/목록 포맷 (ADR-021)
    comment.ts              # PostComment 상세 포맷 (table/JSON/quiet, Issue #45)
    wiki-comment.ts         # WikiComment 전용 포맷 — page.id + creator.member 시그니처 차이 (post comment 와 mailUsers/files/mention 부재)
    file-output.ts          # file 명령군 emit 헬퍼 (ADR-031) — download/download-all/delete 3종

  utils/
    errors.ts               # DoorayCliError (message + exitCode)
    spinner.ts              # ora 래퍼 + setQuiet (--json/--quiet 시 noop proxy 반환, Issue #35 item 1)
    exit-codes.ts           # 0 성공 / 1 API오류 / 2 인증실패 / 3 파라미터오류 / 4 설정오류
    body-input.ts           # --body / --body-file → string (stdin "-" + 충돌 가드)
    dooray-url.ts           # task URL (/task/to/<postId> + /task/<projectId>/<postId> + /project/tasks/<postId>) + wiki URL (/wiki/<wikiId>/<pageId>) parser (ADR-020)
    comment-enrich.ts       # PostComment[] Creator 이름 채우기 (ADR-021, immutable)
    mention.ts              # 멤버·그룹 멘션 마크업 빌더 + prependMentions (Issue #25)
    task-link.ts            # 업무 링크 빌더 (escapeLinkText / buildTaskLink / appendTaskLinks / parseLinkRef, Issue #33)
    feedback-meta.ts        # CLI 버전·환경 수집 + GitHub issue body 빌더 + buildLastRunBlock (ADR-022, ADR-023)
    argv-sanitize.ts        # argv 시크릿 패턴 마스킹 (--api-key/--token/--password/Authorization, ADR-023)
    comment-files.ts        # appendFileReference / removeFileReference — 댓글 본문 markdown reference 조작 (ADR-024)
    wiki-snippet.ts         # wiki inline_image 본문 삽입용 markdown reference 빌더 (ADR-031 보강, Issue #81)
    dooray-message.ts       # resultMessage URL-encoding 디코드 정규화 (API 에러 메시지 표시용)
    attachment-check.ts     # 본문 markdown 의 attachment fileId 추출 (post edit body full-replace 시 누락 confirm)

  commands/
    setup.ts                # dooray setup — 대화형 초기 설정 마법사 (스킬 설치 포함)
    config.ts               # dooray config set|get
    doctor.ts               # dooray doctor
    cache.ts                # dooray cache clear|refresh
    messenger/              # dooray messenger (ADR-033)
      index.ts              # messengerCommand 조립
      send.ts               # 1:1 DM — direct-send (--to id/email + body, resolveMember id/email 공유)
      channel-send.ts       # 대화방 — channels/{id}/logs (--channel id/이름 resolveMessengerChannel + body)

    project/
      list.ts
      members.ts
      workflows.ts
      groups.ts               # dooray project groups <project>
      tags.ts                 # dooray project tags <project>

    member/
      index.ts              # member 서브커맨드 등록
      get.ts                # dooray member get <member-id> (cache 우회, ADR-021)
      list.ts               # dooray member list <project> (project 캐시 활용)
      search.ts             # dooray member search (org-wide, ad-hoc, 캐시 미사용)

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
        latest.ts             # 최신 댓글 N개 단축 조회
        get.ts                # 단일 댓글 상세 (positional 3 / --id / --url + --comment-id, Issue #45)
        add.ts
        edit.ts
        delete.ts
        file/
          index.ts            # commentFileCommand 조립
          list.ts             # 댓글 첨부 목록 (getPostComment → .files, ADR-024)
          upload.ts           # 파일 업로드 + 댓글 reference append
          download.ts         # post-level 다운로드 wrapper (UX 일관성, ADR-024)
          delete.ts           # reference 제거 + 파일 삭제 (atomic 보장 X, ADR-024)
      file/
        list.ts               # 첨부파일 목록
        download.ts           # 단일 파일 다운로드 (--json/--quiet 스키마 ADR-031)
        download-all.ts       # 전체 파일 다운로드 (--json: count/succeeded/failed, ADR-031)
        upload.ts             # 파일 업로드 (--json: res.result raw, --quiet: id, ADR-031)
        delete.ts             # 파일 삭제 (--json/--quiet 스키마 ADR-031)

    wiki/
      list.ts
      pages.ts
      tree.ts               # 페이지 계층 트리 (root 부터 레벨별 재귀 drill-down, --depth 상한, ADR-034) — text 트리 / --json flat(parentPageId)
      page-get.ts
      page-create.ts
      page-edit.ts          # $EDITOR + 비대화형 플래그(--title/--body/--body-file)
      page-delete.ts        # 페이지 삭제 (비공식 DELETE endpoint, ADR-032) — confirm 기본 + --yes, resolveWikiPageInput
      page-file/
        index.ts            # wikiPageFileCommand 조립
        list.ts             # 페이지 첨부 목록 (getWikiPage 응답의 files[] + images[] 합성)
        upload.ts           # 파일 업로드 (multipart type 먼저 → file, ADR-029) + --type general|inline_image (--json/--quiet 스키마 ADR-031)
        download.ts         # 단일 파일 다운로드 (307 redirect, ADR-015 패턴) (--json 스키마 ADR-031)
        download-all.ts     # 페이지 모든 첨부 + inline image 일괄 다운로드 (--json: count/succeeded/failed, ADR-031)
        delete.ts           # 파일 삭제 (post file delete 와 동일 — confirm 없이 즉시) (--json 스키마 ADR-031)
      page-comment/
        index.ts            # wikiPageCommentCommand 조립
        list.ts             # 댓글 목록 (size/page/--latest 지원, 최신순)
        latest.ts           # 최신 댓글 1건 shortcut (= list --latest 1)
        get.ts              # 단일 댓글 본문 + creator + 메타
        add.ts              # 댓글 추가 — --body / --body-file / $EDITOR fallback (post comment add mirror, mention 없음)
        edit.ts             # 댓글 수정 — --body / --body-file / $EDITOR fallback
        delete.ts           # 댓글 삭제 (confirm 없이 즉시)

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
  getProjectMemberGroups(projectId, params?): Promise<MemberGroupListResponse>;
  getPosts(projectId, params?): Promise<PostListResponse>;
  getPost(projectId, postId): Promise<PostDetailResponse>;
  getPostStandalone(postId): Promise<PostDetailResponse>;  // GET /project/v1/posts/{postId} — projectId 불명일 때 (ADR-020)
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
4. resolvers/post-input.ts — 입력 분기:
     • <project> <number>  → resolveProject + resolvePost (4·5단계 정상 실행)
     • --id / --url / URL positional → getPostStandalone(postId) 단일 호출로 4·5단계 단축
5. (positional 모드에서만) resolvers/post.ts — 42 → postId
6. api/client.ts — POST /project/v1/projects/{id}/posts/{id}/set-done
7. formatters/post.ts — 성공 메시지 출력
```

## 에러 처리 원칙

- 모든 에러는 `DoorayCliError(message, exitCode)` 로 통일
- `commands/*` 최상단에서 catch: stderr 출력 후 `process.exit(exitCode)`
- API 4xx: exitCode 1, 인증 401/403: exitCode 2, 파라미터: exitCode 3, config 없음: exitCode 4

## 출력 원칙

- 기본: human-readable (테이블·포맷)
- `--json`: raw JSON (stdout, 파이프 친화)
- `--quiet`: ID만 출력 (스크립팅용)
- `--no-color`: 컬러 제거 (CI 환경, `NO_COLOR` env 자동 감지)
- 스피너·에러: stderr / 데이터: stdout (파이프 시 stderr 오염 방지)
- `--json` / `--quiet` 모드: spinner 완전 억제 (`setQuiet(true)` → `startSpinner` 가 no-op `Proxy<Ora>` 반환).
  jq 같은 파이프에서 stdout 청결 보장 (Issue #35 item 1)

## 테스트

- vitest (코로케이션 `*.test.ts` 패턴 — 소스 옆에 테스트 배치)
- `pnpm test` (단발) / `pnpm test:watch` (개발 중)
- 현재 커버:
  - `src/utils/dooray-url.ts` (URL parser)
  - `src/resolvers/post-input.ts` (7-branch 분기, ADR-020)
  - `src/resolvers/comment-file-input.ts` (option-mode/positional-mode 분기 + secondaryLabel 메시지 customization, plan025)
- 신규 도메인 헬퍼·복잡 분기는 vitest 단위 테스트 동반 권장 (ADR-020 도입 근거)

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
