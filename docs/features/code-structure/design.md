# 코드 구조 정리 기술 설계

스펙: [spec.md](spec.md). 기능 전체(R0~R5)를 설계한다. PR 마다 이 설계에서 자기 몫을 가져가고, 바뀌는 결정만 이 문서를 고친다.
이 문서의 경로는 따로 적지 않으면 `src/` 기준이다. 아직 없는 목표 경로가 문서 경로 검사(`scripts/check-doc-paths.mjs`)에 걸리지 않게 `src/` 를 붙이지 않는다.

## 진단 (2026-11-14)

스펙의 「배경」 을 낳은 진단의 근거다. 줄 수와 개수는 그날 잰 값이고, PR 마다 다시 잰다.

- `api/client.ts` 1279줄, `api/types.ts` 1050줄·타입 157개(웹 PR 머지 뒤 다시 잰 값. 스펙 「배경」 의 1328줄·995줄은 그 전에 잰 값이다). 파라미터 타입이 두 파일에 흩어져 있다(`client.ts` 의 `GetPostsParams` 재내보내기와 `types.ts` 의 파라미터 절).
- `client.ts` 안의 조합 로직: `getAllWikiPages`(쓰는 곳은 `commands/wiki/tree.ts` 하나, 웹 구현도 같은 조합을 따로 갖는다), `downloadPostFile` 의 재조회.
- `utils/` 30개에 세 무리가 섞여 있다.
  - 영역을 모르는 공통 잎: errors, exit-codes, spinner, sanitize, local-date, argv-sanitize, command-hint, config-value, content-disposition, delete-confirmation, dooray-id, dooray-message, dooray-url, download-target, format-size, unknown-option-hint
  - 본문 규칙: body-input, body-markup, body-replace, mention, task-link, attachment-check, inline-file-refs, comment-files, comment-file-merge, wiki-snippet
  - 다른 계층에 기대는 것: comment-enrich(→ `api/types`), feedback-meta(→ `cache/last-run`), mention·task-link(→ `cache/types`), mail-attach·mail-attachment-name(메일 전용)
- `api/imapClient.ts`(510줄)가 readline 확인 절차가 든 `utils/attachment-check.ts` 를 import 한다. 쓰는 것은 `sanitizeFileName` 하나다. mail id → UID 풀이가 그 안에 약 180줄 있다.
- 명령 파일 안의 도메인 로직: `commands/stream/list.ts`(318줄), `commands/messenger/channels.ts`(356줄), `commands/wiki/page-move.ts`, `commands/calendar/event-delete.ts`·`event-edit.ts`, `commands/post/comment/get.ts`.
- 명령 나무 조립 자리가 영역마다 다르다. member·messenger·stream·calendar 는 `commands/<영역>/index.ts` 가 나무를 내보내고, project·post·wiki·mail 은 `index.ts` 가 명령 하나하나를 붙인다.
- 실행 시 순환 0건, 명령 영역 사이 import 0건. 테스트를 뺀 계층 사이 import 의 규칙 위반은 4건이다(아래 「허용 목록」).
- 경로 별칭 실측: esbuild 0.27.7 이 tsconfig `paths` 를 플러그인 없이 풀고, vitest 4.1.11 이 `resolve.tsconfigPaths: true` 로 풀며 `vi.mock("@/…")` 를 상대 경로 import 와 같은 모듈로 잡는다. TypeScript 7.0.2 의 `tsc --noEmit` 도 `baseUrl` 없이 `paths` 를 푼다. 없는 별칭은 tsc 와 빌드 둘 다 실패한다(R0 에서 확인).

## 요구사항 연결

| ID | 해결 방법 |
| --- | --- |
| REQ1 | PR 마다 기준 브랜치와 작업 브랜치를 각각 빌드해 `scripts/help-snapshot.mjs` 로 모든 명령 경로의 `--help` 를 모으고 `--check` 로 비교한다. `pnpm test` 의 테스트 수를 PR 본문에 전후로 적는다 |
| REQ2 | R2 전후의 `pnpm api:inventory` 출력을 비교한다. 인벤토리 스크립트가 `client.ts` 대신 `api/*/public*.ts` 와 `api/public/` 를 읽고 새 호출 꼴을 찾게 R2 에서 고친다(「공개 구현의 꼴」) |
| REQ3 | R1 이 DTO·파라미터를 `api/<영역>/types.ts` 로, R2 가 공개 구현을 `api/<영역>/public.ts` 로 옮긴다. `api/types.ts`·`api/client.ts` 는 재내보내기만 남는다 |
| REQ4 | 영역마다 `create<영역>Public(http)` 가 그 영역 인터페이스를 반환형으로 선언해 컴파일러가 구현을 검사한다. 웹 쪽 `create<영역>Web(context)` 와 같은 꼴이다. 공개 쪽은 `DoorayClient` 타입을 붙인 `createPublicClient` 가 조립해 영역 누락을 컴파일러가 잡는다. 규칙 테스트가 공개·웹 구현의 상호 import 를 막는다. 소비자 쪽은 R2 가 「resolvers·services 는 `DoorayClient` 를 가져오지 않는다」 규칙을 더하고 R4 까지 남은 곳을 비운다 |
| REQ5 | `architecture.test.ts` 가 아래 「의존 규칙」 표로 import 를 검사한다. 지금 위반은 허용 목록으로 시작하고 R3 에서 비운다. 테스트는 허용 목록에 고쳐진 위반이 남아도 실패하므로 목록이 줄어든 상태가 유지된다 |
| REQ6 | tsconfig `paths` 의 `@/*`, vitest `resolve.tsconfigPaths`, tsup(esbuild 기본 동작)으로 푼다. R0 은 `index.ts` 의 import 하나와 `path-alias.test.ts` 로 네 도구를 보인다. R1~R4 의 이동 스크립트가 옮긴 파일과 그 파일을 가리키는 import 를 별칭으로 쓴다 |
| REQ7 | `scripts/check-doc-paths.mjs` 가 문서의 `src/…` 경로를 검사한다. R0 은 보고만 하고, 이동 스크립트가 문서 경로를 함께 고친다. R4 에서 `--strict` 를 CI 에 넣는다 |
| REQ8 | 이동 스크립트가 `git mv` 만 하는 단계와 import·문서를 고치는 단계를 나눠, PR 마다 이동 커밋과 내용 수정 커밋을 따로 만든다 |

## 책임과 경계

### 목표 폴더 나무

계층 폴더는 그대로 두고(스펙 DECISION1) api 안만 영역별로 나눈다. `*` 는 R 번호의 PR 에서 생기거나 바뀌는 자리다.

```
src/
  index.ts              # Commander 루트. 영역마다 내보낸 명령 나무를 붙이기만 한다 (R4*)
  version.ts
  api/
    dooray-client.ts    # 영역 인터페이스의 교집합 DoorayClient 와 createClient. 그대로
    client.ts           # DoorayApiClient 재내보내기만 (R2*)
    types.ts            # 영역 types.ts 재내보내기만 (R1*)
    common/types.ts     # DoorayApiHeader·DoorayApiResponse<T>·오류 응답처럼 영역이 함께 쓰는 DTO (R1*)
    public/             # 공개 API 구현의 공용 부분 (R2*)
      http.ts           #   ky 인스턴스·토큰 버킷·toDoorayCliError·파일 업로드·다운로드 도우미
      index.ts          #   영역 구현을 조립하는 DoorayApiClient
    web/                # 웹 구현의 공용 부분. 그대로
    <영역>/             # project, member, post, wiki, messenger, calendar, stream
      types.ts          #   영역 인터페이스(<영역>Client) + 그 영역의 DTO·파라미터 (R1*)
      public.ts         #   create<영역>Public(http): <영역>Client (R2*)
      web.ts            #   create<영역>Web(context): <영역>Client. 그대로
    mail/               # IMAP·SMTP. DoorayClient 밖이다 (R2*)
      imap.ts  smtp.ts  errors.ts  uid-lookup.ts  attachment-name.ts
    api-path.ts  file-redirect.ts  json-large-integer.ts  rate-limiter.ts  messenger-thread-request.ts   # 두 구현이 함께 쓰는 도구. 그대로
  body/                 # 본문 입력(파일·stdin·편집기)과 마크업·참조·첨부 확인 규칙. 영역 DTO 를 모른다 (R3*)
  utils/                # 영역을 모르는 공통 잎만 (R3*)
  resolvers/ services/ cache/ config/ skill/ editor/ formatters/   # 그대로 (config·skill 은 R5 선택)
  commands/
    <영역>/index.ts     # 모든 영역이 자기 명령 나무를 내보낸다 (R4*)
    <영역>/<명령>.ts    # 옵션 해석과 출력 조합만
    <영역>/<주제>.ts    # 명령 파일에서 뺀 영역 로직. 명령을 내보내지 않는다 (R4*)
```

- `api/<영역>/types.ts` 가 인터페이스와 DTO 를 함께 갖는 것은 스펙 REQ3 의 세 파일 꼴을 따른다. 한 영역의 types.ts 가 800줄을 넘으면 `types-<주제>.ts` 로 나누고 `types.ts` 가 재내보낸다.
- 영역 사이 DTO 참조(예: post 의 담당자가 member 의 타입을 쓰는 것)는 상대 영역의 `types.ts` 만 가져온다.
- `api/public/` 은 웹의 `api/web/` 와 짝이다. 공개 구현의 공용 부분을 영역 폴더 밖에 두어, 영역 폴더에는 그 영역 것만 남긴다.

### R1·R2 에서 정할 것

- R1 의 「나누기」 커밋은 영역 `types.ts` 가 지금 `../types.js` 에서 가져오는 DTO 를 자기 파일이나 `api/common/types.ts`, 다른 영역의 `types.ts` 에서 가져오게 바꾼다. 그대로 두면 재내보내기만 남은 `api/types.ts` 와 서로 가져오는 순환이 된다. 같은 PR 에서 규칙 「`api/<영역>/` 은 `api/types.ts`·`api/client.ts` 를 가져오지 않는다」 를 더한다.
- `dooray-client.test.ts` 는 「types.ts 는 있고 web.ts 는 없는 영역」 을 폴더에서 찾는다. R1 의 `api/common/` 은 영역이 아니므로 그 검사에서 뺀다.
- R2 는 `getAllWikiPages` 를 영역 인터페이스 밖의 함수 `collectWikiPages(client: WikiClient, …)` 로 바꿔 `api/wiki/pages.ts` 에 둔다. 공개(`client.ts`)와 웹(`wiki/web.ts`)이 거의 같은 본문을 따로 갖고 있어서다. `commands/wiki/tree` 와 그 테스트의 mock 이 함께 바뀐다.
- R2 는 `downloadPostFile` 의 재조회를 `api/post/public.ts` 안에 그대로 둔다. 다운로드 한 번의 재시도이고 웹 구현과 공유할 조합이 아니다. 옮기기만 하고 동작은 바꾸지 않는다.
- REQ4 의 소비자 쪽: 지금 resolver 여럿이 전체 `DoorayClient` 를 받는다. R2 가 규칙 「`resolvers`·`services` 는 `api/dooray-client.ts` 를 가져오지 않는다(영역 인터페이스만 받는다)」 를 더하고, 그때 남은 곳은 새 규칙의 허용 목록으로 시작해 R4 에서 비운다.

### R3 의 파일 재분류

| 지금 | 옮길 곳 | 이유 |
| --- | --- | --- |
| body-input, body-markup, body-replace, inline-file-refs, comment-files, comment-file-merge, wiki-snippet | `body/` | 본문 텍스트 규칙이다 |
| attachment-check | `body/attachment-check.ts`. `sanitizeFileName`(`sanitizeForTerminal` 한 줄 감싸기)은 없애고 `api/mail/imap.ts`·`commands/mail/reply.ts` 가 `utils/sanitize` 의 `sanitizeForTerminal` 을 바로 쓴다 | `api` 가 readline 이 든 파일에 기대지 않게 한다. `utils/content-disposition.ts` 에 같은 이름의 다른 함수가 있어 새 파일을 만들지 않는다 |
| body-input 의 `readStdin` | `utils/stdin.ts` | `utils/config-value.ts` 가 쓴다. 그대로 두면 R3 뒤 `utils -> body` 위반이 생긴다 |
| mention, task-link | `body/` | `cache/types` 의 `CachedMe` 대신 필요한 칸만 가진 입력 타입을 body 안에 둔다. 부르는 쪽이 `CachedMe` 를 그대로 넘겨도 구조적 타입으로 맞는다 |
| comment-enrich | `formatters/comment-enrich.ts` | 표 출력 직전의 변환이고 `api` DTO 를 쓴다. formatters 는 api 를 가져와도 된다 |
| feedback-meta | `commands/feedback/meta.ts` (`commands/feedback.ts` 는 `commands/feedback/index.ts` 로) | `cache/last-run` 을 쓰는 명령 하나의 조각이다 |
| mail-attach | `commands/mail/attach.ts` | `mail send`·`reply` 만 쓴다 |
| mail-attachment-name | `api/mail/attachment-name.ts` (R2) | IMAP 응답을 다루는 api 쪽 조각이다 |

R3 이 끝나면 허용 목록은 빈다.

### R4 의 명령 정리

- project·post·wiki·mail 도 `commands/<영역>/index.ts` 에서 `<영역>Command()` 를 내보내고, `index.ts` 는 영역 나무를 `addCommand` 로 붙이기만 한다. 명령 등록 순서는 지금 `--help` 순서를 지킨다(REQ1 스냅숏이 확인한다).
- 명령 파일 안의 영역 로직을 같은 영역의 주제 파일로 뺀다. 대상은 「진단」 의 여섯 파일이다. 새 계층을 만들지 않는다. 캐시 무효화가 필요한 쓰기는 기존 규칙대로 `services/`, 이름 풀이는 `resolvers/` 로 보낸다.

### R5 (선택)

`config/store.ts`(594줄)와 `skill/manager.ts`(663줄)를 읽기·쓰기·이전 같은 주제 파일로 나눈다. 바깥으로 내보내는 이름은 그대로 두고 기존 파일이 재내보낸다. 이 설계에서는 범위만 잡고, R5 를 띄울 때 나눌 선을 정한다.

## 의존 규칙

규칙 테스트(`architecture.test.ts`)가 검사하는 표다. 규칙의 현재 원본은 `docs/code-architecture.md` 「의존 규칙」 이고, 이 표와 테스트의 `LAYER_DEPENDENCIES` 가 같아야 한다.

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
| `services` | utils, body, config, cache, api (resolvers 는 안 된다) |
| `commands` | entry 를 뺀 모든 계층 |
| `entry` (`index.ts`) | 모든 계층 |

계층 안의 규칙:

- 명령 영역(`commands/<영역>/` 과 `commands/<이름>.ts`)은 다른 명령 영역을 가져오지 않는다.
- 공개 구현(`api/client.ts`, `api/public/`, `api/<영역>/public*.ts`)과 웹 구현(`api/web/`, `api/<영역>/web*.ts`)은 서로 가져오지 않는다. 둘을 고르는 `api/dooray-client.ts` 는 어느 쪽도 아니다.
- `api/<영역>/` 은 다른 영역의 `types.ts` 만 가져온다. 영역 안에서 `types-<주제>.ts` 로 나눠도 다른 영역은 `types.ts` 의 재내보내기를 거친다.
- 영역 구현을 나눌 때는 `public-<주제>.ts`, `web-<주제>.ts` 이름만 쓴다. 테스트가 파일 이름으로 공개·웹을 가르므로 다른 이름이나 하위 폴더는 검사에서 빠진다.

검사 방식:

- 대상은 `*.test.ts` 와 `fixtures/` 를 뺀 `src/**/*.ts` 다. 테스트는 mock 을 위해 계층을 넘나들므로 뺀다.
- 정적 `import`·`export … from`·`import()` 의 지정자를 정규식으로 읽는다. `import type` 도 센다. 타입만의 의존도 계층을 묶기 때문이다.
- 상대 경로와 `@/` 별칭을 같은 파일로 푼다. 풀지 못한 지정자는 테스트를 실패시킨다. 정규식이 조용히 놓치는 것을 막으려고 수집한 import 가 500건 아래면 실패한다.
- 위반은 `<파일> -> <대상>` 문자열로 허용 목록과 비교한다. 목록 밖 위반도, 목록에 남은 고쳐진 위반도 실패다.

### 허용 목록 (R0 시작)

| 위반 | 없앨 PR |
| --- | --- |
| `utils/comment-enrich.ts -> api/types.ts` | R3 |
| `utils/feedback-meta.ts -> cache/last-run.ts` | R3 |
| `utils/mention.ts -> cache/types.ts` | R3 |
| `utils/task-link.ts -> cache/types.ts` | R3 |

R1~R2 의 이동으로 경로가 바뀌면 그 PR 이 목록의 경로를 같이 고친다. R4 가 끝날 때 목록은 비어 있어야 한다(REQ5).

## 인터페이스와 데이터

### 공개 구현의 꼴 (R2)

```ts
// api/project/public.ts
export function createProjectPublic(http: PublicHttp): ProjectClient { return { async getProjects(params) { … }, … }; }

// api/public/index.ts
export function createPublicClient(http: PublicHttp): DoorayClient {
  // 타입을 붙인 객체를 거쳐야 영역 하나를 빠뜨렸을 때 컴파일러가 잡는다.
  const client: DoorayClient = { ...createProjectPublic(http), ...createPostPublic(http), … };
  return client;
}
export interface DoorayApiClient extends DoorayClient {}
export class DoorayApiClient {
  constructor(apiKey: string, baseUrl: string) {
    Object.assign(this, createPublicClient(new PublicHttp(apiKey, baseUrl)));
  }
}
```

- 클래스 이름과 생성자 `(apiKey, baseUrl)` 을 지킨다. `dooray-client.ts` 와 테스트가 `new DoorayApiClient(…)` 를 쓰고, 테스트 24곳이 `vi.mock("…/api/client.js", () => ({ DoorayApiClient: class … }))` 로 바꿔 끼운다.
- 그래서 `dooray-client.ts` 는 계속 `./client.js` 에서 가져오고, `client.ts` 는 `api/public/index.ts` 를 재내보낸다. mock 은 `client.js` 모듈을 바꾸므로 재내보내기 뒤에서도 그대로 잡힌다.
- `Object.assign` 은 영역 구현이 반환한 객체 리터럴의 속성만 복사한다. 영역 구현은 클래스 인스턴스를 반환하지 않는다(`api/web/index.ts` 와 같은 제약).
- 인터페이스 병합만으로는 클래스가 메서드를 다 갖췄는지 컴파일러가 보지 않는다(검토에서 실측). 그래서 조립은 `DoorayClient` 타입을 붙인 `createPublicClient` 가 하고, 클래스는 그 결과를 복사만 한다. 영역끼리 메서드 이름이 겹치지 않는지 보는 테스트를 `dooray-client.test.ts` 의 웹 쪽 검사와 같은 꼴로 공개 쪽에도 둔다.
- `client.ts` 에서 인터페이스 밖에 있는 것은 비공개 `requestFileServer`·`followDownloadRedirect` 둘이다. 둘은 `api/public/http.ts` 로 간다.
- 지금 `api-path.test.ts`, `client-file-redirect.test.ts`, `client-download-name.test.ts` 가 인스턴스의 비공개 필드 `api` 를 바꿔 ky 를 끼운다. 영역 구현은 `PublicHttp` 를 closure 로 잡으므로 이 꼴은 효과가 없어진다. R2 는 `PublicHttp` 생성자가 ky 인스턴스를 선택 인자로 받게 하고, 세 테스트를 `createPublicClient(new PublicHttp(…, fakeKy))` 꼴로 바꾼다. 테스트 수는 줄이지 않는다.
- 공개 API 경로는 `apiPath` tagged template 을 그대로 쓴다([ADR-075](../../adr/075-api-path-encoding.md)).
- 인벤토리 스크립트는 지금 `client.ts` 하나에서 `this.api.<메서드>(` 와 `${this.baseUrl}` 꼴을 찾는다. 영역 구현에는 `this` 가 없으므로 R2 는 호출 꼴을 `http.api.<메서드>(apiPath…)` 와 `http.url(apiPath…)` 둘로 정하고, 스크립트가 `api/public/` 과 `api/*/public*.ts` 를 읽어 그 꼴을 찾게 고친다. `api-endpoint-inventory.test.mjs` 를 함께 고치고, 전후 출력이 같은지로 REQ2 를 본다.

### 경로 별칭

- `tsconfig.json` 의 `compilerOptions.paths` 에 `"@/*": ["./src/*"]` 를 둔다. TypeScript 7 은 `baseUrl` 을 쓰지 않으므로 넣지 않는다.
- `vitest.config.ts` 의 `resolve.tsconfigPaths: true` 가 같은 표를 읽는다. 별칭 표의 원본은 tsconfig 하나다.
- tsup 은 esbuild 가 tsconfig `paths` 를 기본으로 풀므로 설정을 바꾸지 않는다.
- 지정자는 지금처럼 `.js` 확장자를 붙인다(`@/utils/errors.js`). `moduleResolution: "Bundler"` 가 `.ts` 로 찾는다.
- 쓰는 자리: 새 파일, 그리고 이동 스크립트가 옮긴 파일과 그 파일을 가리키는 import. 손대지 않는 파일의 다른 import 를 한꺼번에 바꾸지 않는다.
- 가져오는 파일과 대상이 같은 폴더에 있으면(옮긴 뒤 기준) 별칭보다 `./x.js` 가 먼저다. 예: `api/mail/imap.ts` 가 `api/mail/errors.ts` 를 가져오면 `./errors.js`.
- `vi.mock` 은 별칭과 상대 경로 어느 쪽으로 적어도 같은 모듈을 잡는다(`path-alias.test.ts` 가 두 방향을 본다).

### 이동 스크립트 (R1 부터)

`scripts/move-paths.mjs <표.json> --step move|rewrite` 를 R1 에서 만든다. 표는 옛 경로 → 새 경로(`src/` 기준)의 배열이다.

| 단계 | 하는 일 | 커밋 |
| --- | --- | --- |
| `move` | 표의 파일과 짝 테스트(`*.test.ts`)를 `git mv` 한다. 내용을 고치지 않는다 | 이동 커밋. 빌드가 깨진 상태일 수 있다 |
| `rewrite` | 모든 `src/**/*.ts` 의 `import`·`export from`·`import()`·`vi.mock`·`vi.importActual`·`vi.doMock`·`vi.unmock`·`vi.doUnmock`·`vi.importMock` 지정자 가운데 옮긴 파일을 가리키는 것을 `@/<새 경로>.js` 로 바꾼다. 옮긴 파일 안의 상대 import 는 위치가 바뀌었으므로 같은 폴더가 아니면 `@/…` 로 바꾼다. 문서(`check-doc-paths.mjs` 가 읽는 범위)의 `src/<옛 경로>` 를 `src/<새 경로>` 로 바꾼다 | 내용 수정 커밋 |

- 지정자는 옛 위치 기준으로 풀어 표와 비교한다. 문자열만 바꾸지 않고 경로를 풀어 비교하므로 `../../api/types.js` 와 `../types.js` 를 같은 파일로 알아본다.
- `new URL("…", import.meta.url)` 같은 파일 상대 경로는 지원하지 않는다. 파일을 옮긴 뒤 해당 경로를 직접 확인하고 고친다.
- 표에 없는 파일은 손대지 않는다. 실행 뒤 `git diff --stat` 을 PR 본문에 붙인다.
- 이동 커밋은 내용을 바꾸지 않으므로 git 의 이름 바꾸기 탐지가 100% 유사도로 잡는다(REQ8). 이 저장소는 PR 을 merge commit 으로 합치므로 두 커밋이 main 이력에 남는다.
- 파일을 나누는 일(`types.ts` → 영역별)은 이동이 아니라 내용 수정이다. 새 파일은 새 이력으로 시작하고, 원래 파일은 재내보내기로 남아 그 이력을 지킨다. 그래서 R1·R2 는 「나누기」 커밋과 「import 를 새 자리로 바꾸기」 커밋을 따로 둔다.

## 실패와 일관성

- 런타임 상태·데이터 형식·외부 계약을 바꾸지 않는다. 캐시와 설정 파일 형식이 그대로라 되돌릴 때 데이터 이전이 없다.
- 동작 불변의 확인은 PR 마다 세 가지다: 도움말 스냅숏 같음, 테스트 수가 줄지 않고 모두 통과, R2 의 인벤토리 출력 같음.
- 다른 기능 PR 과의 충돌: R1·R2 는 `api/types.ts`·`client.ts` 를 크게 바꾼다. 같은 때 api 를 고치는 PR 이 있으면 코디네이터가 순서를 정한다. 파일 이동은 이동 스크립트를 기준 브랜치 위에서 다시 돌릴 수 있다. R1·R2 의 선언 나누기는 스크립트 대상이 아니므로 충돌하면 선언과 import 를 직접 다시 맞춘다.
- 이동 커밋 하나만 체리픽하면 빌드가 깨진다. PR 단위로만 되돌린다.

## 검증 전략

| PR | 확인 |
| --- | --- |
| R0 | 규칙 테스트가 지금 저장소에서 허용 목록 4건으로 통과하고, 판정 함수 단위 테스트가 위반 꼴을 잡는다. `path-alias.test.ts`(vitest·`vi.mock`), `index.ts` 의 별칭 import(tsc·빌드, `dist/index.js --version`). 도움말 스냅숏이 main 빌드와 같다. 문서 경로 검사가 보고만 한다 |
| R1 | 스냅숏 같음, 테스트 수 같음 이상, `api/types.ts` 가 재내보내기만인지 확인, 허용 목록 경로 갱신 |
| R2 | 위에 더해 `pnpm api:inventory` 전후 같음, 공개·웹 상호 import 0건(규칙 테스트), `client.ts` 재내보내기만, `createPublicClient` 에서 영역 하나를 빼면 tsc 가 실패하는지 한 번 확인 |
| R3 | 허용 목록이 빈다. `api/mail/imap.ts` 가 readline 을 가져오지 않는다 |
| R4 | 명령 나무를 영역에서 받는다. 스냅숏이 순서까지 같다. 문서 경로 검사 `--strict` 가 0건이고 CI 단계에 들어간다 |
| R5 | 내보내는 이름이 같고 스냅숏·테스트가 같다 |

스냅숏 기준은 저장소에 두지 않는다. 기능 PR 이 도움말을 바꿀 때마다 기준 파일을 함께 고치게 되면 정리와 무관한 기여자의 부담이 된다. 정리 PR 이 기준 브랜치를 따로 빌드해 비교한다.

## 도메인 규칙

해당 없음: 스펙의 「도메인 규칙 변경」 이 없음이다. 코드 배치와 개발 규칙만 바뀐다.

## 원칙 대조

- [ADR-017](../../adr/superseded/017-api-types-single-file.md) 의 재검토 조건(800줄, 새 영역 둘 이상)을 둘 다 넘었다. [ADR-082](../../adr/082-code-structure.md) 가 대체한다.
- [ADR-014](../../adr/superseded/014-ts-path-alias-deferred.md) 가 별칭을 미룬 이유(esbuild 플러그인 필요)는 지금 도구에서 사실이 아니다. 같은 [ADR-082](../../adr/082-code-structure.md) 가 대체한다.
- [ADR-081](../../adr/081-web-session-auth.md) 의 영역 인터페이스 두 구현 꼴을 공개 구현에도 똑같이 쓴다. 상속으로 경로만 덮는 안을 기각한 이유(덮지 않은 메서드가 조용히 다른 쪽을 부른다)가 규칙 테스트의 공개·웹 상호 import 금지로 이어진다.
- `docs/code-architecture.md` 의 「`services/*` 는 `resolvers/*` 를 의존하지 않는다」 는 규칙 표에 그대로 들어간다. 쓰기 계열을 따로 둔 이유는 [ADR-042](../../adr/042-cache-invalidation-on-mutation.md) 가 갖는다.
- [ADR-048](../../adr/048-checks-to-mjs.md) 대로 새 스크립트는 `node:` 빌트인만 쓰는 `.mjs` 다. 규칙 테스트는 vitest 안에서 돌므로 `.ts` 다.

## 결정

스펙의 DECISION1~DECISION7 을 받아 이 설계가 정한 기술 결정이다.

| ID | 결정 | 답 | 누가 | 근거 |
| --- | --- | --- | --- | --- |
| DECISION8 | 구조와 의존 규칙의 기록 | 스펙 DECISION1·DECISION3 을 [ADR-082](../../adr/082-code-structure.md)(architecture)로 남기고, 규칙의 원본은 `docs/code-architecture.md` 와 `src/architecture.test.ts` 다 | 작성자 | 여러 PR 과 이후 기여자가 다시 참조할 경계다 |
| DECISION9 | 별칭 결정의 기록 | 스펙 DECISION4 를 같은 [ADR-082](../../adr/082-code-structure.md) 에 둔다. 원본은 `tsconfig.json`, `vitest.config.ts` | 작성자 | 별칭은 구조 정리의 이동 방식과 한 몸이다 |
| DECISION10 | 공개 구현의 꼴 | `DoorayApiClient` 클래스 이름과 생성자를 지키고 안에서 영역 구현을 조립한다. ADR 은 따로 두지 않는다 | 작성자 | [ADR-081](../../adr/081-web-session-auth.md) 의 두 구현 꼴을 따르고, 이름을 지키는 이유는 기존 테스트의 mock 이다 |
| DECISION11 | 이동 방식 | 이동 스크립트가 이동·내용 수정 두 단계로 커밋을 나누고 문서 경로를 함께 고친다(스펙 DECISION5) | 작성자 | REQ8 의 `git log --follow` 와 REQ7 을 한 도구로 지킨다 |
| DECISION12 | 검사 도구의 자리 | 규칙 표는 테스트 안의 상수, 스크립트는 `scripts/*.mjs`, 도움말 스냅숏 기준은 저장소에 두지 않는다 | 작성자 | 되돌리기 쉬운 내부 선택이다. 이유는 「검증 전략」 에 있다 |
