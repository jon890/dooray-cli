# dooray-cli 코드 구조

## 기술 스택

| 역할            | 선택                                  |
| --------------- | ------------------------------------- |
| 언어            | TypeScript (Node 20+)                 |
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
| 문서 검사       | `node:` 빌트인만 쓰는 `.mjs` 스크립트. CI 에서 의존성 설치 전에 실행한다 (ADR-048) |

## 디렉터리 구조

```
src/
  index.ts        # CLI entrypoint. Commander 루트와 명령 나무 조립
  version.ts      # 빌드 때 주입된 CLI_VERSION

  api/            # HTTP·IMAP·SMTP 래퍼와 API 요청·응답 타입
  resolvers/      # 사람이 준 이름·URL·부분 입력을 식별자로 바꾼다. 읽기 전용
  services/       # 캐시의 유효성을 깨는 변경. 성공 직후 해당 캐시를 지운다
  cache/          # ~/.dooray/cache/ 파일 CRUD 와 TTL
  config/         # ~/.dooray/config.json CRUD
  skill/          # 번들 스킬의 설치 상태 판정과 install/update
  editor/         # $EDITOR 실행과 frontmatter 직렬화
  formatters/     # 엔티티별 표·JSON·quiet 출력
  utils/          # 오류, 종료 코드, 본문 입력, 마크업, 확인 절차 같은 공용 조각
  commands/       # 명령 하나에 파일 하나. 위 계층을 조합한다
    messenger/  project/  member/  post/  wiki/  mail/
```

파일 하나하나가 무엇을 하는지는 여기 적지 않는다.
같은 사실을 코드 주석과 ADR 과 이 문서 셋에 두면 갱신 지점이 셋이 되고, 그중 하나가 낡는다.

| 알고 싶은 것 | 보는 곳 |
| --- | --- |
| 이 파일이 무엇을 하는가 | 그 파일의 머리말 주석 |
| 왜 이렇게 만들었는가 | `docs/adr/INDEX.md` 에서 찾은 ADR |
| 어느 계층에 두어야 하는가 | 아래 「모듈 의존 관계」 |
| 어떤 명령과 옵션이 있는가 | `README.md` 와 `dooray <명령> --help` |

새 파일을 더할 때 이 절에 줄을 더하지 않는다. 디렉터리가 새로 생길 때만 고친다.


## 모듈 의존 관계

```
commands/* → resolvers/* → cache/store + api/client   (읽기: 이름 → id 번역)
commands/mail/{get,reply} → resolvers/mail-input → api/imapClient   (캐시 없이 mail id → UID 조회)
commands/* → services/*  → cache/store + api/client + config/store   (쓰기: 변경과 캐시 무효화, ADR-042)
commands/* → formatters/*
commands/* → utils/errors
commands/setup|doctor|skill → skill/manager → skill/manifest
editor/    → api/client (현재 데이터 fetch) + resolvers/member
```

- `commands/setup.ts`는 services/config, api/client, @inquirer/prompts에 의존하고 스킬 파일시스템 처리는 `skill/manager.ts`에 위임. config 저장을 `services/config`로 보내 계정·환경이 바뀌면 캐시가 함께 비워지게 한다 (ADR-042)
- `skill/context.ts`는 절대 경로 `XDG_DATA_HOME`이 있으면 `dataRoot`를 `$XDG_DATA_HOME/dooray-cli`로 주입하고, 없거나 상대 경로이면 `homeDir/.local/share/dooray-cli`를 주입한다.
- `skill/manager.ts`는 경로·현재 버전을 주입받아 명령 출력과 분리된 순수 상태 전이를 제공한다. 테스트 전용 등으로 `SkillManagerContext.dataRoot?`가 없으면 `homeDir/.local/share/dooray-cli`를 사용한다.
- `skill/manifest.ts`는 외부 JSON을 타입 가드로 검증하고 매니페스트 자신을 제외한 정규 파일만 결정론적으로 해시
- `api/client`는 순수 HTTP 래퍼. 비즈니스 로직 없음
- `api/client`의 모든 요청은 `api/rate-limiter`의 토큰 버킷을 공유한다. 호출부는 요청 간격을 신경 쓰지 않는다 (ADR-039)
- 이름을 id 로 바꾸는 resolver 는 캐시를 우선 조회하고, 만료 시 `api/client` 를 호출한다.
- `resolvers/mail-input` 은 입력 형태를 분류하고, mail id 는 캐시 없이 `api/imapClient` 에서 UID 로 조회한다.
- `resolvers/*`는 읽기 전용이다. 쓰기 함수를 넣지 않는다
- 캐시의 유효성을 깨는 변경은 `services/*`를 거친다. 그 함수가 성공 직후 무효해진 캐시를 지운다 (ADR-042)
  - 엔티티를 바꾸는 API 호출은 그 엔티티의 캐시 파일 하나를, `apiKey`·`baseUrl` 변경은 전체 캐시를 지운다
- `services/*`는 `resolvers/*`를 의존하지 않는다. 둘을 조합하는 것은 `commands/*`의 몫이다
- `commands/*`는 resolvers, api/client, formatters 조합

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
- `index.ts` 의 `parseAsync().catch` 가 전역에서 받는다. `오류: ` 접두사를 붙여 stderr 로 내고
  `DoorayCliError` 의 `exitCode` 로 끝내며 `trackLastRun` 기록도 여기서 한다
- 그래서 `commands/*` 는 던지기만 한다. 명령 안에서 `process.exit` 를 부르면 위 셋을 건너뛴다
- API 4xx: exitCode 1, 인증 401/403: exitCode 2, 파라미터: exitCode 3, config 없음: exitCode 4, 파일 시스템 오류: exitCode 5

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
- `pnpm test` 가 도는 테스트 파일은 68개다. 세 곳에 나뉘어 있다.
  - `src/` 의 `*.test.ts` 62개. `api`, `cache`, `config`, `editor`, `formatters`, `resolvers`,
    `services`, `skill`, `utils` 와 `commands` 의 mail·messenger·post·project·wiki 계열이 대상이다.
  - `scripts/` 의 `*.test.mjs` 3개. 문서 검사 스크립트와 endpoint 목록 스크립트를 본다 (ADR-048).
  - `skills/dooray-persona/scripts/lib/` 의 `*.test.mjs` 3개.
- `vitest.config.ts` 가 `worktrees/**` 를 대상에서 뺀다. 그 아래는 git worktree 라 같은 테스트가 중복 수집된다.
- 신규 도메인 헬퍼·복잡 분기는 vitest 단위 테스트 동반 권장 (ADR-020 도입 근거)

## 빌드·배포

CLI 버전은 `package.json`을 단일 원천으로 삼고 `tsup` 빌드 시 번들에 주입한다.
`tsup.config.ts` 의 `define` 이 `package.json` 의 `version` 을 `__DOORAY_CLI_VERSION__` 로 심고,
`src/version.ts` 가 그 값을 읽어 `CLI_VERSION` 으로 내보낸다.
빌드하지 않고 소스를 직접 실행하면 그 값이 없으므로 `"0.0.0-dev"` 가 된다.
빌드 검증에서 `dist/index.js --version` 과 `package.json` 일치를 확인한다.

빌드 옵션은 `package.json` 의 스크립트 문자열이 아니라 `tsup.config.ts` 가 소유한다.
`entry`, `format: ["cjs"]`, `target: "node18"`, `clean`, shebang banner,
그리고 `imapflow`·`mailparser`·`nodemailer` 를 번들에서 빼는 `external` 이 거기 있다.

```json
// package.json 핵심
{
  "name": "@bifos/dooray-cli",
  "bin": { "dooray": "dist/index.js" },
  "engines": { "node": ">=20" },
  "scripts": {
    "build": "tsup"
  }
}
```
