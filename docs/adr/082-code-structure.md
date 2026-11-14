## ADR-082: 계층 폴더는 두고 api 안만 영역별로 나누며, 의존 규칙을 테스트로 막고 경로 별칭 `@/…` 을 쓴다

- **status**: `accepted`
- **decision-type**: `architecture`
- **areas**: `engineering-process`
- **현재 규칙의 원본**: 목표 구조와 의존 규칙은 `docs/code-architecture.md`, 규칙 검사는 `src/architecture.test.ts`, 별칭은 `tsconfig.json` 의 `paths` 와 `vitest.config.ts`. 요구사항은 [코드 구조 정리 스펙](../features/code-structure/spec.md), PR 별 설계는 [기술 설계](../features/code-structure/design.md)
- **결정**: `src/` 의 계층 폴더(api, resolvers, services, cache, config, formatters, commands 등)는 그대로 두고, api 계층 안만 영역 폴더(`api/<영역>/`)로 나눠 영역마다 인터페이스·DTO(`types.ts`), 공개 API 구현(`public.ts`), 웹 구현(`web.ts`)을 둔다. `api/types.ts`·`api/client.ts` 는 재내보내기만 남긴다. 본문 규칙은 `body/` 로 모으고 `utils/` 에는 영역을 모르는 공통 부품만 둔다.
  계층 사이와 영역 사이의 의존 방향을 규칙 테스트로 검사해 CI 에서 실패로 막는다. 지금 있는 위반은 허용 목록으로 시작하고 정리 PR 마다 줄인다.
  import 경로 별칭 `@/…`(`src/` 를 가리킨다)을 도입한다. 새 코드와 옮긴 코드가 쓰고, 기존 import 를 한꺼번에 바꾸지 않는다.
  [ADR-017](superseded/017-api-types-single-file.md) 의 `api/types.ts` 단일 파일 유지와 [ADR-014](superseded/014-ts-path-alias-deferred.md) 의 별칭 보류를 대체한다.
- **맥락**: 2026-11-14 진단에서 `api/client.ts` 가 1279줄, `api/types.ts` 가 1050줄·타입 157개로 [ADR-017](superseded/017-api-types-single-file.md) 의 재검토 조건(800줄, 새 영역 둘 이상)을 둘 다 넘었다. 웹 로그인 세션 기능([ADR-081](081-web-session-auth.md))이 영역 인터페이스와 웹 구현을 영역 폴더에 먼저 들였고, 공개 구현만 한 파일에 남아 있었다.
  `utils/` 30개에 공통 부품·본문 규칙·메일 전용 코드가 섞였고, 그중 넷이 상위 계층(api, cache)을 가져왔다. 그동안 의존 방향은 문서로만 있었고 검사가 없었다.
  [ADR-014](superseded/014-ts-path-alias-deferred.md) 가 별칭을 미룬 이유는 「esbuild 가 tsconfig `paths` 를 풀지 못해 플러그인이 필요하다」 였다. 같은 날 실측에서 esbuild 0.27.7 은 플러그인 없이 풀었고, vitest 4.1.11 은 `resolve.tsconfigPaths` 로 풀며 `vi.mock("@/…")` 를 상대 경로 import 와 같은 모듈로 잡았다. TypeScript 7 은 `baseUrl` 없이 `paths` 를 푼다. 파일을 옮길 때 깊이가 바뀌는 상대 경로를 고쳐 쓰는 일이 별칭으로 줄어든다.
- **대안 기각**:
  - **영역 세로 폴더(`domains/<영역>/` 아래에 api·명령·포맷터를 모으기)** — 약 300개 파일이 옮겨지고 동시에 일하는 기여자의 PR 이 모두 충돌한다. 실제 고통은 api 두 파일에 몰려 있어 api 안만 나눠도 풀린다. 사용자가 계층 유지를 골랐다(2026-11-14).
  - **지금 구조에서 두 파일만 기능별 파일로 쪼개기** — 공개·웹 구현의 짝이 영역마다 흩어지고, 새 기여자가 한 영역을 고칠 때 찾을 곳이 정해지지 않는다.
  - **의존 규칙을 문서와 리뷰로만 지키기** — 지금 위반 넷이 그렇게 생겼다. 정리한 구조가 다시 섞인다.
  - **dependency-cruiser 같은 외부 도구로 검사하기** — 의존성이 늘고 규칙 표가 설정 파일 문법에 묶인다. 필요한 규칙은 import 지정자를 읽는 테스트 하나로 충분하다.
  - **허용 목록 없이 위반을 먼저 다 고치고 규칙을 켜기** — 규칙이 정리 PR 이 다 끝날 때까지 꺼져 있어, 그 사이 들어오는 기능 PR 이 새 위반을 만든다.
  - **별칭을 도입하며 기존 import 를 한꺼번에 바꾸기** — 수백 줄 diff 가 다른 PR 과 충돌하고, 구조 정리의 이동 diff 와 섞여 리뷰가 어렵다.
- **결과**:
  - 얻는 것: 영역 하나를 고칠 때 `api/<영역>/` 한 폴더를 보면 된다. 공개·웹 구현이 같은 인터페이스를 컴파일러 검사로 구현하고 서로 섞이지 않는다. 금지한 방향의 import 는 CI 가 막는다. 파일을 옮겨도 별칭 import 는 고칠 필요가 없다.
  - 감당할 것: 정리 PR 여럿(R1~R4)이 이어지는 동안 api 를 고치는 다른 PR 과 충돌할 수 있다. 상대 경로와 별칭 import 가 한동안 섞여 있다. 규칙 테스트는 정규식으로 import 를 읽으므로, 주석 안에 import 문을 쓰면 잡힐 수 있고 지정자를 문자열 조합으로 만든 동적 import 는 놓친다.
- **확인 방법**: `src/architecture.test.ts`(규칙과 허용 목록), `src/path-alias.test.ts`(vitest·`vi.mock` 의 별칭 풀이), 정리 PR 마다 전후 빌드의 `scripts/help-snapshot.mjs` 비교와 `scripts/check-doc-paths.mjs` 의 문서 경로 검사.
