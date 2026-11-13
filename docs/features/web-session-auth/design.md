# 웹 로그인 세션 인증 방식 기술 설계

스펙: [spec.md](spec.md)

이 설계는 기능 전체의 구조를 정하고, 웹 경로는 PR1(기반 + project·member) 범위의 읽기 경로만 실측해 적는다.
PR2~PR4 의 경로는 그 PR 의 plan 이 같은 방법으로 실측해 `docs/api/web-endpoints.md` 에 더한다. 구조 결정은 다시 하지 않는다.
이 기능의 PR1 은 「비밀값·캐시 파일 보호 강화」 PR 이 머지된 뒤 그 위에서 시작한다. 두 PR 이 `src/config/**`, `src/commands/doctor.ts`, `getConfigOrThrow` 를 함께 고친다. 그 PR 이 만든 `getConfigOrThrow(options?: { securityWarning?: boolean })`, `doctor --json` 의 `checks`, 실패 시 종료 코드 1 을 이어 쓴다.

## 요구사항 연결

| ID | 해결 방법 |
| --- | --- |
| REQ1 | `Config.authMode` 를 더하고 `config set auth-mode` 가 값을 검사한다. 명령은 `createClient(config)` 로 클라이언트를 받는다 |
| REQ2 | `config set session-cookie` 가 입력을 `parseSessionCookie` 로 정규화해 `SESSION` 값만 저장한다 |
| REQ3 | `sessionCookie` 를 `SECRET_FIELDS` 에 더한다. 웹 HTTP 층의 오류 메시지는 URL·호스트·쿠키를 담지 않는다 |
| REQ4 | 웹 HTTP 층이 요청마다 origin 을 확인하고, 리다이렉트를 따라가지 않는다. 첨부 307 은 기존 `isTrustedFileHost` 에 공개 API 주소를 기준으로 넘겨 판정한다 |
| REQ5 | `resolveWebBaseUrl(config)` 가 `base-url` 을 알려진 클라우드 표로 바꾼다 |
| REQ6 | 영역별 웹 클라이언트 메서드가 웹 응답을 공식 문서의 그 endpoint 응답 스키마 모양으로 바꿔 돌려준다. 포매터는 바꾸지 않는다 |
| REQ7 | 쓰기 메서드도 같은 방법으로 웹 경로에 붙인다. PR 마다 지정된 테스트 장소에서 실측한다 |
| REQ8 | `assertWebSupported(명령 경로, 옵션, 방식)` 가 `src/index.ts` 의 `preAction` 에서 API 호출 전에 막는다. 지원하지 않는 옵션도 같은 함수가 막는다 |
| REQ9 | 웹 HTTP 층이 401·로그인 리다이렉트와 403 을 나눠 `DoorayCliError` 로 바꾼다 |
| REQ10 | `setup` 이 첫 질문으로 방식을 묻는다. 웹이면 테넌트 주소를 먼저 확인하고 쿠키를 `password` 입력으로 받아 `getMe` 로 확인한다. 기존 설정을 펼친 위에 고른 방식의 값만 덮는다 |
| REQ11 | `config set auth-mode web` 과 `setup` 의 웹 선택이 stderr 경고를 한 번 낸다. `doctor` 는 `auth-mode` 항목을 `warn` 으로 보인다 |
| REQ12 | `doctor` 가 `isConfigComplete` 로 완료를 판정하고, 연결 확인은 `createClient(config).getMe()` 를 직접 불러 실패 메시지를 그대로 보인다 |
| REQ13 | `shouldInvalidateCache` 가 `authMode`(없으면 `api-key`), `sessionCookie`, 웹 방식의 `tenantName` 을 비교한다 |
| REQ14 | PR4 에서 `dooray-persona` 스크립트의 HTTP 호출을 `dooray ... --json` 실행으로 바꾼다 |
| REQ15 | `resolveWebBaseUrl` 이 정할 수 없으면 `EXIT_CONFIG_ERROR` 다. 웹 방식에서 `tenantName` 이 `example` 이면 미설정으로 본다 |
| REQ16 | `isConfigComplete` 가 방식별로 판정하고 `getConfigOrThrow` 와 `doctor` 가 같이 쓴다 |
| REQ17 | REQ8 과 같은 목록과 판정이다. PR 마다 그 PR 이 붙인 명령만 목록에 더한다 |

## 책임과 경계

| 자리 | 책임 |
| --- | --- |
| `src/api/client.ts` | 지금의 공개 API 클라이언트. 동작을 바꾸지 않는다. `DoorayClient` 를 구현한다고 선언만 더한다 |
| `src/api/dooray-client.ts` (새 파일) | `DoorayClient` 교집합 타입(영역 인터페이스의 공개 메서드 시그니처 그대로)와 `createClient(config)` |
| `src/api/<영역>/types.ts` | ProjectClient·MemberClient·PostClient·WikiClient·MessengerClient·CalendarClient·StreamClient. 공개 메서드 시그니처를 영역별로 소유하며 DTO 는 api/types.ts 에 둔다 |
| `src/api/web-http.ts` (새 파일) | 웹용 ky 인스턴스. 쿠키 헤더, origin 확인, 리다이렉트 처리, 오류 변환(URL 없는 메시지), 토큰 버킷, 큰 정수 파서 |
| `src/api/web/index.ts`, `src/api/project/web.ts`, `src/api/member/web.ts`, `web/convert.ts`, `web/context.ts` (새 파일) | `DoorayClient` 의 웹 구현. 메서드마다 웹 경로를 부르고 공식 응답 스키마 모양으로 바꾼다. 붙이지 않은 메서드는 지원하지 않음 오류를 던진다 |
| `src/config/web-auth.ts` (새 파일) | `resolveWebBaseUrl`, `parseSessionCookie`, `isConfigComplete`. 파일 시스템과 키체인을 쓰지 않는 순수 함수 |
| `src/config/store.ts`, `types.ts` | `authMode`, `sessionCookie` 필드와 검사, `config set` 키, `readAuthModeFromFile()`(파일만 읽어 방식을 돌려준다) |
| `src/commands/web-support.ts` (새 파일) | 웹 방식에서 지원하는 명령 경로와 명령별 미지원 옵션, 순수 함수 `assertWebSupported` |
| `src/index.ts` | `preAction` 에서 `readAuthModeFromFile` 과 `assertWebSupported` 를 부른다 |
| `src/resolvers/*`, `src/services/tag.ts`, `src/editor/index.ts` | 매개변수 타입을 `DoorayApiClient` 에서 `DoorayClient` 로 바꾼다. 동작은 바꾸지 않는다 |
| `src/services/config.ts` | 캐시 무효화 판정과 키별 안내 문구 |
| `src/commands/*` | `new DoorayApiClient(...)` 를 `createClient(config)` 로 바꾼다. `doctor`·`setup`·`config` 는 아래 절대로 고친다 |
| `docs/api/web-endpoints.md` (새 파일) | 메서드마다 부르는 웹 경로, 쿼리, 실측 날짜, 공식 스키마와 다른 점. [ADR-062](../../adr/062-undocumented-endpoint-policy.md) 조건 2 의 자리다 |

- 의존 방향은 `commands → api/dooray-client → (api/client | api/web/index → api/<영역>/web → api/web-http)` 다. resolver·services·editor 는 `DoorayClient` 타입만 안다.
- `DoorayApiClient` 는 private 필드가 있어 TypeScript 가 다른 구현을 그 타입으로 받지 않는다. 그래서 인터페이스로 바꾸는 일은 resolver·services 매개변수까지 간다.
- 웹 클라이언트를 공개 클라이언트의 하위 클래스로 만들지 않는다. 덮지 않은 메서드가 공개 API 를 부르는 사고가 난다.
- `web-support.ts` 는 명령 경로를 다루므로 `commands/` 에 둔다. api 층은 CLI 명령을 모른다.
- `web-auth.ts` 를 `store.ts` 와 나누는 이유는 `createClient` 가 키체인·파일 시스템 없이 주소를 정하고, `store.ts` 를 통째로 mock 하는 기존 테스트(`doctor.test.ts`)를 깨지 않기 위해서다.
- `scripts/api-endpoint-inventory.mjs` 는 `src/api/client.ts` 만 읽으므로 웹 경로가 「구현에 있고 공식에 없는 것」 에 섞이지 않는다(스펙 DECISION25).

## 인터페이스와 데이터

### 설정

| 필드 | `config set` 키 | 값 | 저장 |
| --- | --- | --- | --- |
| `authMode` | `auth-mode` | `api-key` \| `web`. 없으면 `api-key` | 일반 필드 |
| `sessionCookie` | `session-cookie` | `SESSION` 쿠키 값 | 비밀 필드. macOS 키체인, 그 밖은 0600 파일([ADR-069](../../adr/069-macos-keychain-secret-store.md)) |

- `config get` 은 `auth-mode`, `session-cookie` 를 받는다. `session-cookie` 는 `설정됨`·`미설정` 만 낸다.
- `getConfig` 는 키체인에서 `sessionCookie` 를 `authMode === "web"` 일 때만 읽는다. `api-key` 사용자의 모든 명령에 키체인 읽기 한 번이 더해지지 않게 한다.
- `config set tenant-name` 은 영문 소문자·숫자·`-` 만 받는다. `config set base-url` 은 `https://` 로 시작해야 하고 끝 `/` 는 떼어 저장한다.

`isConfigComplete(config)` 는 빠진 항목 이름 목록을 돌려준다. 비면 완료다.

| 방식 | 필요한 것 |
| --- | --- |
| `api-key` | `apiKey`, `baseUrl` |
| `web` | `sessionCookie`, `baseUrl`, `tenantName`(`example` 이면 빠진 것으로 본다), `resolveWebBaseUrl` 성공 |

`getConfigOrThrow` 는 빠진 항목을 이름으로 말하고 `dooray setup` 을 안내한다. `mail` 명령은 이 함수를 거치므로 웹 방식이면 `apiKey` 없이 통과한다.

### 쿠키 입력 정규화(`parseSessionCookie`)

1. 앞뒤 공백을 떼고, 값 전체를 감싼 따옴표 한 쌍과 `Cookie:` 머리를 뗀다.
2. `;` 가 있거나 `SESSION=` 으로 시작하면 쿠키 헤더로 본다. `;` 로 나누고 각 조각을 첫 `=` 에서 이름과 값으로 나눠 이름이 `SESSION` 인 값을 고른다.
   - 하나도 없으면 `EXIT_PARAM_ERROR`.
   - 서로 다른 값이 둘 이상이면 `EXIT_PARAM_ERROR`. 같은 값이 겹치면 하나로 본다.
3. 아니면 입력 전체가 값이다. 끝의 `=`(base64 채움)는 값의 일부다.
4. 값이 비었거나 출력 가능한 ASCII 가 아니거나 `;`·공백을 담으면 `EXIT_PARAM_ERROR`. 메시지에 값을 넣지 않는다.

### 테넌트 웹 주소(`resolveWebBaseUrl`)

| `base-url` 호스트 | 웹 주소 | 공개 API 주소(첨부 판정 기준) | 실측 |
| --- | --- | --- | --- |
| `api.dooray.com` | `https://<tenant>.dooray.com` | `https://api.dooray.com` | 2026-11-13 확인 |
| `api.gov-dooray.com` | `https://<tenant>.gov-dooray.com` | `https://api.gov-dooray.com` | 하지 않음 |
| `api.gov-dooray.co.kr` | `https://<tenant>.gov-dooray.co.kr` | `https://api.gov-dooray.co.kr` | 하지 않음 |
| `api.dooray.co.kr` | `https://<tenant>.dooray.co.kr` | `https://api.dooray.co.kr` | 하지 않음 |

표는 `API_ENDPOINTS`(`src/config/types.ts`)와 같은 네 클라우드다. 표 밖이거나 `https` 가 아니면 REQ15 의 설정 오류다.

### 웹 HTTP 층(`web-http.ts`)

- ky 인스턴스의 `prefix` 는 웹 주소다. `Cookie: SESSION=<값>` 은 인스턴스 헤더가 아니라 `beforeRequest` 훅에서 붙인다. 훅은 `new URL(request.url).origin` 이 웹 주소의 origin 과 같지 않으면 쿠키를 붙이지 않고 요청 전에 멈춘다. `URL`·`Request` 객체 입력은 ky 가 `prefix` 를 붙이지 않기 때문이다.
- `Authorization` 은 보내지 않는다. `redirect: "manual"` 이다.
- 오류 변환:

| 응답 | 종료 코드 | 메시지 |
| --- | --- | --- |
| 401, `location` 경로가 `/auth/signin` 으로 시작하는 3xx | `EXIT_AUTH_ERROR`(2) | 세션이 끝났거나 쿠키가 틀렸다. 브라우저에서 `SESSION` 쿠키를 꺼내 `dooray config set session-cookie -` 로 다시 넣는다 |
| 403 | `EXIT_AUTH_ERROR`(2) | 이 계정에 그 대상의 권한이 없다 |
| 그 밖 3xx | `EXIT_API_ERROR` | 웹이 다른 주소로 보냈다. 주소는 넣지 않는다 |
| 429 | `EXIT_RATE_LIMITED` | 공개 클라이언트와 같다 |
| 그 밖 4xx·5xx | `EXIT_API_ERROR` | 본문의 `header.resultMessage`, 없으면 상태 코드 |
| 2xx 인데 `header.isSuccessful === false` | `EXIT_API_ERROR` | `header.resultMessage` |
| HTML 본문, JSON 파싱 실패 | `EXIT_API_ERROR` | 웹 응답이 JSON 이 아니다 |
| 타임아웃, 네트워크 오류 | `EXIT_API_ERROR` | 종류만 말한다 |

- 어느 메시지에도 요청 URL, 호스트, 쿠키 값을 넣지 않는다. ky 의 `HTTPError`·`TimeoutError` 메시지는 URL 을 담으므로 그대로 쓰지 않는다. 메시지는 `last-run.json` 을 거쳐 `feedback --last` 로 공개 이슈에 들어갈 수 있다(`src/index.ts`).
- 토큰 버킷과 큰 정수 파서는 공개 클라이언트와 같이 쓴다.
- 첨부 다운로드·업로드의 307 은 `isTrustedFileHost(location, <공개 API 주소>)` 로 판정한다. 함수는 바꾸지 않는다. 공개 API 주소를 넘기면 `api.` 를 뗀 도메인(`*.dooray.com`)이 허용되고, 그 밖은 막힌다. 파일 서버 요청에는 쿠키를 붙이되 `redirect: "manual"` 과 연쇄 리다이렉트 거부는 [ADR-074](../../adr/074-file-redirect-hardening.md) 와 같다.

### 응답 변환

비교 기준은 공식 API 문서의 그 endpoint 응답 스키마다(스펙 DECISION26). `src/api/types.ts` 는 CLI 가 쓰는 필드만 담아 기준이 되지 못한다.

| 웹 응답 꼴 | 예 | 바꾸는 법 |
| --- | --- | --- |
| 공식과 같다 | `/wapi/project/v1/projects` | 그대로 |
| `result.content` 한 객체 | `/v2/wapi/members/me`, `/v2/wapi/members/{id}` | `result` 를 `result.content` 로 바꾼다 |
| `result.contents` 배열과 `result.references` | `/v2/wapi/projects/!{id}/workflows`, `tags`, `milestones`, `templates` | `result` 를 배열로, `totalCount` 를 위로 올린다. 공식 스키마가 참조 객체를 품으면 `references` 에서 채운다 |

- 공식 스키마에 있는 필드 가운데 웹 응답에서 얻을 수 있는 것은 모두 채운다. 웹에 없는 필드는 키를 만들지 않는다.
- 날짜는 공식 스키마의 표기(오프셋을 단 ISO 8601)로 맞춘다. 19자리 id 는 문자열로 둔다([ADR-051](../../adr/051-json-large-integer-precision.md)).
- 공식 스키마의 필수 필드를 웹에서 얻지 못하면 변환 함수가 `EXIT_API_ERROR` 로 멈춘다. 웹 쪽 변경을 조용히 넘기지 않는다.
- 웹 경로의 프로젝트 id 앞 `!` 는 웹 클라이언트가 `apiPath` 로 인코딩한 뒤 붙인다([ADR-075](../../adr/075-api-path-encoding.md)).
- 웹 프로젝트 멤버 응답은 원소마다 `member` 객체를 담는다. 웹 클라이언트가 그것을 프로세스 메모리에 담아 두고 `getMemberDetail` 에 재사용한다. `fetchAllMembers`(`src/resolvers/member.ts`)가 멤버마다 상세를 병렬로 부르는 호출 수를 줄인다. 웹 호출 한도를 실측하지 않았고, 사고 직후라 많은 비브라우저 호출이 세션 차단을 부를 수 있다.

### PR1 웹 경로

읽기 경로의 실측이다(2026-11-13, 로그인한 브라우저 세션).

| `DoorayClient` 메서드 | 웹 경로 | 꼴 |
| --- | --- | --- |
| `getMe` | `GET /v2/wapi/members/me` | `content` |
| `getProjects` | `GET /wapi/project/v1/projects` | 공식과 같음 |
| `getProjectMembers` | `GET /wapi/task/v1/projects/!{id}/members` | 원소가 `{ projectId, role, member: {...} }` |
| `getMemberDetail` | `GET /v2/wapi/members/{id}` | `content` |
| `searchMembers` | `GET /v2/wapi/members?name=` | `contents` + `references` |
| `getProjectWorkflows` | `GET /v2/wapi/projects/!{id}/workflows` | `contents` |
| `getProjectTags` | `GET /v2/wapi/projects/!{id}/tags` | `contents` + `references.tagPrefixMap` |
| `getProjectMilestones` | `GET /v2/wapi/projects/!{id}/milestones` | `contents` + `references` |
| `getProjectTemplates`, `getProjectTemplateDetail` | `GET /v2/wapi/projects/!{id}/templates`, `/templates/{templateId}` | `contents` + `references` |
| `getProjectMemberGroups` | `GET /v2/wapi/projects/!{id}/project-member-groups` | `contents` + `references` |
| `createProjectTag`, `updateProjectTagGroup` | PR1 에서 실측 | |

`/v2/wapi/members/search` 는 200 이지만 `result.content` 가 문자열이라 쓰지 않는다.

아래 실측은 2026-11-14 완료했고 [웹 경로 색인](../../api/web-endpoints.md)에서 영역별 기록을 찾는다. 쓰기는 새 임시 그룹에서만 했고 웹 화면에서 정리했다. 반복해서 쓰지 않는다.

- 공개 호출이 쓰는 쿼리(`member=me`, `type`, `scope`, `state`, `page`, `size`, `externalEmailAddresses`, `userCode`)를 웹이 받는지. `page` 를 무시하면 목록 루프(`src/resolvers/project.ts`)가 같은 페이지를 거듭 받으므로 페이지 넘기기를 꼭 본다.
- `ensureMe` 가 쓰는 `defaultOrganization` 의 id 를 웹 `me` 응답에서 얻는 법.
- 쓰기(태그 생성, 태그 그룹 수정)에 추가 헤더가 필요한지. **값이 `SESSION` 이 아닌 다른 쿠키에서 와야 하면 스펙 DECISION19 가 무너지므로 구현을 멈추고 spec 으로 되돌린다.**
- 태그 생성 실측은 CLI 로 지울 명령이 없다. 만든 태그는 웹 화면에서 지우고 PR 본문에 적는다.

### 지원 범위 막기(`web-support.ts`)

- 목록은 `commands/web-support/project.ts`, `member.ts` 처럼 영역별 파일에 두고 `web-support.ts` 가 모은다. 판정 함수는 하나다. 목록은 웹 방식으로 돌 수 있는 명령 경로와, 명령마다 웹에서 지원하지 않는 옵션이다. PR1 의 `member get --with-org` 는 캘린더 경로가 필요해 막는다. 예: PR1 의 `member search` 는 `--email`·`--user-code`·`--user-code-exact` 를 웹 경로에서 받는지 실측해 정한다.
- `assertWebSupported(path, opts, mode)` 는 순수 함수다. 방식이 `web` 이고 명령이 목록에 없거나 미지원 옵션 값이 있으면 스펙 REQ8 의 메시지와 `EXIT_PARAM_ERROR` 를 던진다.
- 설정을 쓰지 않는 명령(`setup`, `config`, `doctor`, `cache`, `skill`, `feedback`)과 `mail` 은 목록과 무관하게 통과한다.
- `preAction` 은 `readAuthModeFromFile()` 로 파일만 읽는다. 키체인을 읽지 않고, 보안 경고도 내지 않는다. 비밀값·캐시 파일 보호 강화 설계가 `config`·`setup` 에서 경고하지 않기로 한 것을 지킨다.
- `web/index.ts` 가 영역별 web.ts 구현을 조립한다. 미지원 영역의 기본값은 index 에만 두고 뒤 PR 은 자기 영역 파일과 등록 줄을 더한다.

- 웹 클라이언트의 붙이지 않은 메서드도 같은 오류를 던진다. 목록에 넣은 명령이 붙이지 않은 메서드를 부르는 실수를 런타임에도 막는다.
- 가이드의 「웹 방식에서 지원하지 않는 명령·옵션」 표는 문서에 적고, vitest 테스트가 그 표와 목록이 같은지 본다. CI 의 문서 검사는 의존성 설치 전에 돌아 TS 파일을 불러올 수 없다([ADR-048](../../adr/048-checks-to-mjs.md)).

### `setup`

1. 첫 질문은 방식이다. 기존 설정의 방식이 기본값이다.
2. 웹이면 클라우드와 테넌트 이름을 묻는다. 테넌트 이름에는 기본값을 주지 않는다. `resolveWebBaseUrl` 로 주소를 확인한 뒤 쿠키를 꺼내는 방법을 보이고 쿠키를 가린 입력으로 받는다.
3. `createClient` 로 만든 클라이언트의 `getMe` 로 확인한다. 실패하면 오류 종류에 따라 다시 묻는다. 401 이면 쿠키를, 설정 오류면 테넌트를 다시 묻는다. 403 과 그 밖은 메시지를 보이고 끝낸다.
4. 저장은 기존 설정을 펼친 위에 고른 방식의 값만 덮어쓴다. 고르지 않은 방식의 비밀값을 지우지 않는다(스펙 DECISION21). `replaceConfig` 를 거쳐 캐시 무효화도 탄다.

### `doctor`

- 완료 판정 세 자리(연결 확인 여부, 요약 문구, `checks`)를 모두 `isConfigComplete` 로 바꾼다.
- 연결 확인은 `ensureMe` 가 아니라 `createClient(config).getMe()` 를 직접 부른다. 캐시된 내 정보로 통과하지 않게 한다. 실패하면 `DoorayCliError` 메시지를 그대로 보이고 `api-connection` 을 `fail` 로 둔다.
- 웹 방식에서는 `checks` 의 `api-key` 항목 대신 `session-cookie`·`tenant-name` 항목을 둔다. `--json` 평면 키는 그대로 두고 `authMode` 키를 더한다. `apiKeyOk` 는 웹 방식에서도 지금 뜻(값이 있는가)을 지킨다.
- `auth-mode` 항목은 웹 방식이면 비공식 API 경고와 함께 `warn` 이다. `warn` 은 종료 코드에 넣지 않는다.

### 캐시 무효화

- `shouldInvalidateCache` 는 비교 전에 `authMode ?? "api-key"` 로 맞춘다. 값이 없던 기존 사용자가 `api-key` 로 저장해도 캐시가 지워지지 않는다.
- 웹 방식에서는 `tenantName` 변경도 무효화 대상이다.
- `config set` 의 캐시 비움 안내 문구는 키별로 나눈다(쿠키: 계정이 바뀌었을 수 있다, 방식: 접속 경로가 바뀌었다).

### 경고

- 비공식 API 경고는 `config set auth-mode web` 이 저장에 성공한 직후와 `setup` 에서 웹을 고른 직후 stderr 로 한 번 낸다. 일반 명령 실행 때는 내지 않는다.

## 실패와 일관성

- 공개 클라이언트의 동작은 바뀌지 않는다. `auth-mode` 가 없으면 지금과 같은 경로를 탄다.
- PR 사이 버전에서는 목록에 없는 명령이 REQ17 대로 막힌다.
- 세션 쿠키는 브라우저 로그아웃이나 세션 만료로 무효가 된다. CLI 는 갱신하지 않고 REQ9 로 안내한다.
- 웹 경로와 응답이 바뀌면 변환 함수가 필수 필드를 잃거나 HTML 을 받는다. 둘 다 `EXIT_API_ERROR` 로 드러난다.
- 쓰기가 웹 쪽 변경으로 다른 결과를 낼 위험은 스펙 DECISION3 이 감수했다.
- `dooray-persona` 스크립트는 PR4 까지 지금처럼 API 키로 직접 부른다. 웹 방식에서는 PR4 전까지 동작하지 않는다.

## 검증 전략

| ID | 경계 | 방법 |
| --- | --- | --- |
| REQ1, REQ15, REQ16 | `web-auth.ts`, `createClient` | 단위 테스트. 방식별 `isConfigComplete`, 표 밖 `base-url`, `http`, 빠진 `tenant-name`, `example` |
| REQ2 | `parseSessionCookie` | 단위 테스트. 값만, `=` 로 끝나는 값, `SESSION=`, 헤더 전체, 따옴표·공백, `SESSION` 없는 헤더, 서로 다른 `SESSION` 둘, 비ASCII |
| REQ3 | `web-http`, `config get`, 실행 기록 | 웹 HTTP 층의 모든 오류 경로에서 메시지에 호스트·쿠키 값이 없다. 기존 비밀 필드 테스트에 `sessionCookie` 를 더한다 |
| REQ4, REQ9 | `web-http` | ky 에 가짜 `fetch` 를 넣는 단위 테스트. 401, 403, `/auth/signin` 302, 다른 호스트 302, HTML 200, `isSuccessful: false`, 타임아웃, `URL` 객체로 다른 origin 을 넘긴 요청(쿠키 없이 멈춤), 첨부 307 의 `*.dooray.com` 허용과 그 밖 거부 |
| REQ5 | `resolveWebBaseUrl` | 단위 테스트. 네 클라우드와 표 밖 |
| REQ6 | 변환 함수 | 메서드마다 실측 응답의 꼴을 본뜬 고정 파일(값은 가짜, `node scripts/check-pii.mjs` 통과)로, 결과의 키·구조·날짜 형식이 공식 문서 스키마와 같은지 본다. 공식 스키마의 필드 목록은 `docs/api/web-endpoints.md` 에 메서드마다 적는다 |
| REQ6, REQ7 | 실제 웹 | PR 마다 그 PR 명령을 웹 방식으로 돌려 `--json` 을 공식 스키마와 대조한다. 쓰기는 사용자가 지정한 사내 테스트 프로젝트, 나에게 보내는 메신저, 개인 캘린더에서 하고 만든 것은 지운다. API 복구 뒤 두 방식 비교는 후속 확인이다 |
| REQ8, REQ17 | `assertWebSupported` | 단위 테스트. 목록에 없는 명령, 미지원 옵션, 설정을 쓰지 않는 명령 통과, `api-key` 방식 통과 |
| REQ10 | `setup` | `setup.test.ts` 에 웹 흐름, 401 재질문, 기존 `apiKey` 보존을 더한다 |
| REQ11 | `config set`, `doctor`, 일반 명령 | 경고가 켤 때 한 번 나오고, 웹 방식의 `project list` 에서는 나오지 않는다 |
| REQ12 | `doctor` | 웹 방식 완료 시 연결 확인을 하고, 캐시된 내 정보가 있어도 `getMe` 를 부르며, 실패 메시지가 보인다 |
| REQ13 | `shouldInvalidateCache`, `replaceConfig` | 단위 테스트. `authMode` 없음과 `api-key` 는 같음, 쿠키 변경, 웹 방식 `tenantName` 변경(`config set` 과 `setup` 두 경로) |
| REQ14 | `dooray-persona` 스크립트 | PR4 에서 그 스크립트의 테스트가 CLI 실행을 가짜로 바꿔 본다 |

## 결정

| ID | 결정 | 답 | 누가 | 근거 |
| --- | --- | --- | --- | --- |
| DECISION1 | 두 방식을 나누는 경계 | `DoorayClient` 인터페이스와 구현 두 개, `createClient` 로 고른다. resolver·services 의 매개변수 타입도 인터페이스로 바꾼다 | 작성자 | 명령·포매터를 바꾸지 않는다. 하위 클래스는 덮지 않은 메서드가 공개 API 를 부른다 |
| DECISION2 | 응답 변환 자리와 기준 | 웹 클라이언트 메서드 안, 기준은 공식 응답 스키마 | 작성자 | 포매터가 한 모양만 안다. `types.ts` 는 필드 일부만 담는다(스펙 DECISION26) |
| DECISION3 | 지원 범위의 원본 | `src/commands/web-support.ts` 의 명령·옵션 목록과 순수 판정 함수 | 작성자 | REQ8 을 명령 시작에서 지키고 단위 테스트로 본다 |
| DECISION4 | 웹 경로 명세 자리 | `docs/api/web-endpoints.md` 색인과 영역별 `web-endpoints/*.md` | 작성자 | 스펙 DECISION25 |
| DECISION5 | 테넌트 웹 주소 | 네 클라우드 표. 웹 방식의 `example` 은 미설정 | 작성자 | `dooray.com` 실측과 같은 규칙. `example` 은 `setup` 기본값이라 그대로 두면 엉뚱한 호스트로 쿠키가 나간다 |
| DECISION6 | 리다이렉트 판정 | `/auth/signin` 은 세션 만료, 그 밖은 따라가지 않는 API 오류 | 작성자 | 2026-11-13 실측 |
| DECISION7 | 공개 클라이언트 | 동작을 바꾸지 않는다 | 작성자 | API 가 복구되면 지금 동작 그대로 돌아가야 한다 |
| DECISION8 | 쿠키를 붙이는 자리 | `beforeRequest` 에서 origin 을 확인한 뒤 | 작성자 | 인스턴스 헤더는 `URL` 객체 입력 한 번에 다른 호스트로 나간다 |
| DECISION9 | 첨부 307 판정 | `isTrustedFileHost` 를 바꾸지 않고 공개 API 주소를 기준으로 넘긴다 | 작성자 | 함수를 바꾸면 공개 클라이언트의 판정이 바뀐다 |
| DECISION10 | 오류 메시지 | URL·호스트·쿠키를 담지 않는다 | 작성자 | 메시지가 실행 기록을 거쳐 공개 이슈로 나갈 수 있다. 테넌트 주소는 사내 식별자다(CLAUDE.md) |
| DECISION11 | 웹 멤버 상세 | 멤버 목록 응답의 `member` 를 프로세스 메모리에 담아 재사용한다 | 작성자 | 멤버 수만큼 병렬 호출을 줄인다. 웹 호출 한도를 실측하지 않았다 |
| DECISION12 | `preAction` 의 설정 읽기 | 파일만 읽는 `readAuthModeFromFile` | 작성자 | 키체인 읽기를 늘리지 않고 `config`·`setup` 에서 보안 경고를 내지 않는다 |

## 결정 기록 연결

| 결정 | 종류 | ADR 또는 필요 없음의 이유 | 현재 규칙의 원본 |
| --- | --- | --- | --- |
| 스펙 DECISION3·5·10·25·26, 이 설계 DECISION1·3·8·9·10 | architecture (areas: security, operations) | [ADR-081](../../adr/081-web-session-auth.md). [ADR-062](../../adr/062-undocumented-endpoint-policy.md) 에 대체된 부분 링크를 단다 | 이 설계, `src/api/dooray-client.ts`, `src/commands/web-support.ts`, `docs/api/web-endpoints.md` |
| 스펙 DECISION12 | 같은 ADR | [ADR-069](../../adr/069-macos-keychain-secret-store.md) 에 대체된 부분 링크를 단다. [ADR-069](../../adr/069-macos-keychain-secret-store.md) 의 「`apiKey` 가 없으면 `getConfigOrThrow` 가 setup 을 안내한다」 는 웹 방식에서 `isConfigComplete` 로 바뀐다 | `src/config/secret-store.ts` 의 `SECRET_FIELDS`, `src/config/web-auth.ts` |

PR 마다 함께 고칠 문서(그 PR 이 닿는 것만):

- `CLAUDE.md`: 「공식 문서에 없는 endpoint 는 … 읽기 전용이어야」 에 웹 방식 예외 한 줄, 「`--json` 은 raw 유지」 를 「공개 API 응답 모양 유지」 로(스펙 DECISION24). PR1.
- `docs/code-architecture.md`: 「API Client 구조」 의 클라이언트 하나·생성자 서술, 모듈 의존 관계, 출력 원칙. PR1.
- `docs/data-schema.md`: 비밀 필드 목록, `tenantName` 이 캐시와 무관하다는 서술. PR1.
- `docs/guide/setup.md`, `README.md`, `skills/dooray-cli/SKILL.md`: 웹 방식 켜는 법, 비공식 API 경고, 쿠키 꺼내는 법, 지원하지 않는 명령 표. PR1 에서 만들고 PR 마다 표를 늘린다.
- [ADR-042](../../adr/042-cache-invalidation-on-mutation.md): 무효화 대상 키. PR1.

구현 배치 보완(사용자 결정 2026-11-14): 웹 구현은 api/<영역>/web.ts, 영역 계약은 api/<영역>/types.ts 로 나눈다. DTO 는 api/types.ts 에 남긴다. DoorayClient 는 영역 계약의 교집합이다. 지원 목록·웹 경로 명세·고정 응답도 영역별 파일로 나눈다. 뒤 PR 들이 동시에 자기 영역을 구현할 수 있게 한다. 기존 책임 경계와 보안 규칙은 유지한다.

영역 계약은 PR1 에 모두 둔다(사용자 결정 2026-11-14). project·member 의 web.ts 는 자기 영역 인터페이스 전체를 구현해 누락을 컴파일러가 검사한다. web/index.ts 는 영역별 구현이나 미지원 기본값을 등록하고 공통 Proxy 로 지원하지 않는 메서드를 막는다. then 은 반환하지 않아 Promise 로 오인되지 않는다. 뒤 PR 은 자기 영역 web.ts 와 등록 줄을 더한다. 단일 영역 resolver·service 는 그 영역 계약만 받으며 여러 영역을 함께 쓰는 경로는 DoorayClient 를 유지한다.
