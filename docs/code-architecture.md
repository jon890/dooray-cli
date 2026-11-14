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
| 문서 검사       | `node:` 빌트인만 쓰는 `.mjs` 스크립트. CI 에서 의존성 설치 전에 실행한다 ([ADR-048](adr/048-checks-to-mjs.md)) |

## 디렉터리 구조

계층 폴더를 두고 api 안만 영역별로 나눈다 ([ADR-082](adr/082-code-structure.md)). 정리는 PR 여럿(R0~R5)으로 진행 중이라 지금 상태와 목표를 나눠 적는다.
PR 마다 무엇이 옮겨지는지는 [코드 구조 정리 기술 설계](features/code-structure/design.md)가 갖는다. 정리가 끝나면 「지금」 을 지우고 목표만 남긴다.

### 지금

```
src/
  index.ts        # CLI entrypoint. Commander 루트와 명령 나무 조립
  version.ts      # 빌드 때 주입된 CLI_VERSION

  api/            # HTTP·IMAP·SMTP 래퍼와 API 요청·응답 타입
  resolvers/      # 사람이 준 이름·URL·부분 입력을 식별자로 바꾼다. 읽기 전용
  services/       # 캐시의 유효성을 깨는 변경. 성공 직후 해당 캐시를 지운다
  cache/          # ~/.dooray/cache/ 파일 CRUD 와 TTL
  config/         # ~/.dooray/config.json CRUD 와 비밀값 저장소(macOS 키체인, ADR-069)
  skill/          # 번들 스킬의 설치 상태 판정과 install/update
  editor/         # $EDITOR 실행과 frontmatter 직렬화
  formatters/     # 엔티티별 표·JSON·quiet 출력
  utils/          # 오류, 종료 코드, 본문 입력, 마크업, 확인 절차 같은 공용 조각
  commands/       # 명령 하나에 파일 하나. 위 계층을 조합한다
    messenger/  project/  member/  post/  wiki/  mail/  calendar/  stream/
```

### 목표

```
src/
  index.ts        # 영역마다 내보낸 명령 나무를 붙이기만 한다
  version.ts
  api/
    dooray-client.ts   # 영역 인터페이스의 교집합 DoorayClient 와 createClient
    client.ts types.ts # 재내보내기만
    common/            # 영역이 함께 쓰는 DTO
    public/            # 공개 API 구현의 공용 부분(HTTP, 영역 구현 조립)
    web/               # 웹 구현의 공용 부분(HTTP, 영역 구현 조립, 변환 도구)
    <영역>/            # types.ts(인터페이스와 DTO) public.ts(공개 구현) web.ts(웹 구현)
    mail/              # IMAP·SMTP
  body/           # 업무·위키 본문 규칙. 영역 타입을 모르는 텍스트 처리
  utils/          # 영역을 모르는 공통 부품만
  resolvers/  services/  cache/  config/  skill/  editor/  formatters/   # 책임은 지금과 같다
  commands/
    <영역>/index.ts   # 그 영역의 명령 나무
    <영역>/*.ts       # 명령 파일과, 명령 파일에서 뺀 그 영역의 로직
```

파일 하나하나가 무엇을 하는지는 여기 적지 않는다.
같은 사실을 코드 주석과 ADR 과 이 문서에 함께 두면 갱신 지점이 여러 곳이 되고, 그중 하나가 낡는다.

| 알고 싶은 것 | 보는 곳 |
| --- | --- |
| 이 파일이 무엇을 하는가 | 그 파일의 머리말 주석 |
| 왜 이렇게 만들었는가 | `docs/adr/INDEX.md` 에서 찾은 ADR |
| 어느 계층에 두어야 하는가 | 아래 「의존 규칙」 |
| 어떤 명령과 옵션이 있는가 | `docs/guide/` 와 `dooray <명령> --help` |

새 파일을 더할 때 이 절에 줄을 더하지 않는다. 디렉터리가 새로 생길 때만 고친다.

## 의존 규칙

`src/architecture.test.ts` 가 아래 규칙으로 `src/` 의 import 를 검사하고, 어기면 `pnpm test` 가 실패한다. 이 표가 규칙의 원본이고 테스트의 `LAYER_DEPENDENCIES` 가 같은 내용이다. 규칙을 바꾸면 둘을 함께 고친다.
계층은 `src/` 바로 아래 폴더다. `index.ts` 는 entry, `version.ts` 는 version 이다. 같은 계층 안은 언제나 가져와도 된다.

| 가져오는 계층 | 가져와도 되는 계층 |
| --- | --- |
| `version`, `utils` | 없음 |
| `body` | utils |
| `config` | utils |
| `cache` | utils, config |
| `api` | utils, body, config, version |
| `skill` | utils, version |
| `editor` | utils, body, api, cache |
| `formatters` | utils, body, api |
| `resolvers` | utils, body, config, cache, api |
| `services` | utils, body, config, cache, api |
| `commands` | entry 를 뺀 모든 계층 |
| `entry` | 모든 계층 |

계층 안의 규칙:

- 명령 영역(`commands/<영역>/` 과 `commands/<이름>.ts`)은 다른 명령 영역을 가져오지 않는다.
- 공개 API 구현(`api/client.ts`, `api/public/`, `api/<영역>/public.ts`)과 웹 구현(`api/web/`, `api/<영역>/web.ts`)은 서로 가져오지 않는다. 둘을 고르는 `api/dooray-client.ts` 는 어느 쪽도 아니다.
- `api/<영역>/` 은 다른 영역의 `types.ts` 만 가져온다.
- `api/<영역>/` 은 `api/types.ts`·`api/client.ts` 를 가져오지 않는다. DTO 와 파라미터는 자기 영역이나 다른 영역의 `types.ts`, 공통 응답 구조는 `api/common/types.ts` 에서 가져온다.
- `api/common/` 은 다른 api 영역을 가져오지 않는다. 여러 영역이 쓰는 본문·참여자·식별자 DTO 도 이곳에 둔다.

검사 방식:

- 테스트 파일(`*.test.ts`)은 검사하지 않는다. mock 을 위해 계층을 넘나든다.
- `import type` 도 센다. 타입만의 의존도 계층을 묶는다.
- 지금 남은 위반은 테스트의 `ALLOWED_VIOLATIONS` 에 있다. 고치면 목록에서 지운다. 고친 위반이 목록에 남아도 테스트가 실패한다. 새 위반을 목록에 더하지 않는다.

### 계층별 책임

```
commands/* → resolvers/* → cache/store + api/dooray-client   (읽기: 이름 → id 번역)
commands/mail/{get,attachment,reply} → resolvers/mail-input → api/imapClient   (캐시 없이 mail id → UID 조회)
commands/* → services/*  → cache/store + api/dooray-client + config/store   (쓰기: 변경과 캐시 무효화, ADR-042)
commands/* → formatters/*
commands/* → utils/errors
commands/setup|doctor|skill → skill/manager → skill/manifest
editor/    → api/<영역>/types + cache/types + utils (편집 데이터 타입과 임시 파일)
```

- `commands/setup.ts`는 services/config, api/dooray-client, @inquirer/prompts에 의존하고 스킬 파일시스템 처리는 `skill/manager.ts`에 위임. config 저장을 `services/config`로 보내 계정·환경이 바뀌면 캐시가 함께 비워지게 한다 ([ADR-042](adr/042-cache-invalidation-on-mutation.md))
- `skill/context.ts`는 절대 경로 `XDG_DATA_HOME`이 있으면 `dataRoot`를 `$XDG_DATA_HOME/dooray-cli`로 주입하고, 없거나 상대 경로이면 `homeDir/.local/share/dooray-cli`를 주입한다.
- `skill/manager.ts`는 경로·현재 버전을 주입받아 명령 출력과 분리된 순수 상태 전이를 제공한다. 테스트 전용 등으로 `SkillManagerContext.dataRoot?`가 없으면 `homeDir/.local/share/dooray-cli`를 사용한다.
- `skill/manifest.ts`는 외부 JSON을 타입 가드로 검증하고 매니페스트 자신을 제외한 정규 파일만 결정론적으로 해시
- `api/dooray-client`는 인증 방식에 맞는 구현을 고른다. 공개 HTTP 는 `api/client`, 웹 HTTP 는 `api/web/http` 가 맡는다.
- 두 HTTP 구현은 `api/rate-limiter`의 토큰 버킷을 재사용한다. 호출부는 요청 간격을 신경 쓰지 않는다 ([ADR-039](adr/039-rate-limit-token-bucket.md))
- 이름을 id 로 바꾸는 resolver 는 필요한 영역 계약을 받아 캐시를 우선 조회하고, 만료 시 `api/dooray-client` 를 호출한다.
- `resolvers/mail-input` 은 입력 형태를 분류하고, mail id 는 캐시 없이 `api/imapClient` 에서 UID 로 조회한다.
- `resolvers/*`는 읽기 전용이다. 쓰기 함수를 넣지 않는다
- 캐시의 유효성을 깨는 변경은 `services/*`를 거친다. 그 함수가 성공 직후 무효해진 캐시를 지운다 ([ADR-042](adr/042-cache-invalidation-on-mutation.md))
  - 엔티티를 바꾸는 API 호출은 그 엔티티의 캐시 파일 하나를, 인증 계정·환경 변경은 전체 캐시를 지운다
- `services/*`는 `resolvers/*`를 의존하지 않는다. 둘을 조합하는 것은 `commands/*`의 몫이다
- `commands/*`는 resolvers, api/dooray-client, formatters 조합

## API Client 구조

`src/api/dooray-client.ts` 의 영역별 인터페이스 교집합인 DoorayClient 를 공개 API 구현(`client.ts`)과 웹 구현(`web/index.ts`)이 구현한다. 명령은 createClient(config) 로 고른다.
영역 계약과 DTO·파라미터는 api/<영역>/types.ts, 공통 응답 구조는 api/common/types.ts, 웹 구현은 api/<영역>/web.ts 에 둔다. api/types.ts 는 기존 경로를 위한 타입 재내보내기만 남긴다. 공개 구현은 아직 client.ts 한 파일에 있다. R2 에서 api/<영역>/public.ts 로 옮기고 client.ts 도 재내보내기만 남긴다 ([ADR-082](adr/082-code-structure.md)). 웹 index 는 영역 구현을 조립하고 아직 없는 영역은 요청 없이 실패시킨다. `web/http.ts` 는 origin 검사·쿠키·리다이렉트·오류 변환을 맡는다.
메서드 목록은 여기 적지 않는다. 메서드가 늘 때마다 낡고, 그 파일을 열면 바로 보인다.

```bash
rg "^\s+(async )?\w+\(" src/api/client.ts src/api/*/web.ts
```

메서드가 지키는 규약은 다음과 같다.

- 공개 구현의 생성자는 `apiKey` 와 `baseUrl`, 웹 구현은 쿠키와 검증한 웹 주소를 받는다. 명령은 팩토리를 사용한다
- 요청은 `api/rate-limiter` 의 토큰 버킷을 공유한다. 호출부는 요청 간격을 신경 쓰지 않는다
- 응답 JSON 은 `parseJson` 에 물린 `json-large-integer` 파서를 거친다.
  19자리 식별자가 정수로 파싱되면서 손실되는 것을 막는다
- 실패는 `toDoorayCliError` 를 거쳐 `DoorayCliError` 로 바뀐다. ky 예외를 밖으로 내보내지 않는다

새 endpoint 를 더할 때는 공식 문서를 먼저 확인한다. 절차는 `CLAUDE.md` 가 소유한다.
공식 문서에 없는 경로를 쓰는 조건은 `docs/adr/062-undocumented-endpoint-policy.md` 가 소유한다.

## 커맨드 실행 흐름 (예: `dooray post done my-project 42`)

```
1. index.ts — Commander가 커맨드 파싱
2. commands/post/done.ts — 실행 진입
3. config/store.ts — apiKey, baseUrl 로드 (없으면 exitCode 4)
4. resolvers/post-input.ts — 입력 분기:
     • <project> <number>  → resolveProject + resolvePost (4·5단계 정상 실행)
     • --id / --url / URL positional → getPostStandalone(postId) 단일 호출로 4·5단계 단축
5. (positional 모드에서만) resolvers/post.ts — 42 → postId
6. api/client.ts (api-key 방식) — POST /project/v1/projects/{id}/posts/{id}/set-done
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
- `--json`: 공개 API 모양의 JSON (stdout, 파이프 친화). 웹의 내부 필드는 변환한다
- `--quiet`: ID만 출력 (스크립팅용)
- `--no-color`: 컬러 제거 (CI 환경, `NO_COLOR` env 자동 감지)
- 스피너·에러: stderr / 데이터: stdout (파이프 시 stderr 오염 방지)
- `--json` / `--quiet` 모드: spinner 완전 억제 (`setQuiet(true)` → `startSpinner` 가 no-op `Proxy<Ora>` 반환).
  jq 같은 파이프에서 stdout 청결 보장 (Issue #35 item 1)

## 테스트

- vitest (코로케이션 `*.test.ts` 패턴 — 소스 옆에 테스트 배치)
- `pnpm test` (단발) / `pnpm test:watch` (개발 중)
- `pnpm test` 가 도는 테스트 파일은 아래 위치에 있다.
  - `src/` 의 `*.test.ts`. 테스트 대상 파일 옆에 둔다.
  - `scripts/` 의 `*.test.mjs`. 문서 검사 스크립트와 endpoint 목록 스크립트를 본다 ([ADR-048](adr/048-checks-to-mjs.md)).
  - `skills/dooray-persona/scripts/lib/` 의 `*.test.mjs`.
- `vitest.config.ts` 가 `worktrees/**` 를 대상에서 뺀다. 그 아래는 git worktree 라 같은 테스트가 중복 수집된다.
- `src/architecture.test.ts` 가 「의존 규칙」 을 검사한다.
- 신규 도메인 헬퍼·복잡 분기는 vitest 단위 테스트 동반 권장 ([ADR-020](adr/020-post-input-unification-vitest.md) 도입 근거)

## import 경로

`src/` 아래 파일은 경로 별칭 `@/…` 으로 가져올 수 있다(`@/utils/errors.js` 는 `src/utils/errors.ts`). 별칭 표의 원본은 `tsconfig.json` 의 `paths` 다.
`vitest.config.ts` 의 `resolve.tsconfigPaths` 가 같은 표를 읽고, tsup(esbuild)은 설정 없이 푼다. `vi.mock("@/…")` 는 상대 경로로 가져온 같은 모듈에도 적용된다.
새 파일과 옮긴 파일은 별칭을 쓴다. 같은 폴더의 파일은 `./x.js` 로 둔다. 손대지 않는 기존 import 를 한꺼번에 바꾸지 않는다 ([ADR-082](adr/082-code-structure.md)).

## 구조 정리 도구

| 도구 | 하는 일 |
| --- | --- |
| `scripts/help-snapshot.mjs` | 빌드한 CLI 의 모든 명령 경로 `--help` 를 모은다. `--check <기준>` 은 다르면 종료 코드 1. 정리 PR 이 기준 브랜치 빌드와 비교해 사용자에게 보이는 명령이 그대로인지 보인다 |
| `scripts/check-doc-paths.mjs` | 문서의 `src/…` 경로가 있는 파일을 가리키는지 본다. 기본은 보고만, `--strict` 는 낡은 경로가 있으면 종료 코드 1 |

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
