## ADR-081: 인증 방식을 `api-key` 와 `web` 둘로 두고, 웹 방식은 비공식 웹 API 를 쓰기까지 허용한다

- **status**: `accepted`
- **decision-type**: `architecture`
- **areas**: `security`, `operations`
- **현재 규칙의 원본**: [웹 로그인 세션 인증 스펙](../features/web-session-auth/spec.md)과 [기술 설계](../features/web-session-auth/design.md), 클라이언트 선택은 `src/api/dooray-client.ts`, 지원 명령은 `src/api/web-support.ts`, 웹 경로 명세는 `docs/api/web-endpoints.md`
- **결정**: 설정 값 `auth-mode` 로 공개 API(`api-key`, 기본)와 웹 로그인 세션(`web`)을 고른다. 웹 방식은 테넌트 웹 주소에 `SESSION` 쿠키를 붙여 웹 화면이 쓰는 `/wapi`·`/v2/wapi` 경로를 부르고, 응답을 공개 API 응답 모양으로 바꿔 돌려준다.
  두 방식은 `DoorayClient` 인터페이스의 구현 둘이고 명령은 `createClient` 로 받는다. 자동 전환과 명령별 옵션은 두지 않는다.
  웹 방식에 한해 [ADR-062](062-undocumented-endpoint-policy.md) 의 「읽기 전용」 과 조건 1~4 를 아래처럼 바꾼다. 공개 API 방식의 비공식 경로에는 [ADR-062](062-undocumented-endpoint-policy.md) 가 그대로 적용된다.
  - 쓰기도 허용한다.
  - 조건 1(공식 문서 확인)은 웹 경로 전체가 공식 문서에 없으므로 endpoint 마다 하지 않는다.
  - 조건 2(실측 기록)는 ADR 대신 `docs/api/web-endpoints.md` 한 파일에 메서드마다 남긴다.
  - 조건 3(`KNOWN_UNDOCUMENTED`)은 적용하지 않는다. `api:inventory` 는 공개 API 클라이언트만 읽는다.
  - 조건 4(사용자 경고)는 명령마다 두지 않고, 웹 방식을 켜는 순간·`doctor`·README·`skills/dooray-cli/SKILL.md` 에 둔다.
  `SESSION` 쿠키는 [ADR-069](069-macos-keychain-secret-store.md) 의 비밀 필드에 더한다.
- **맥락**: 2026-11-13 Dooray 가 보안 사고 대응으로 개인 API·Admin API 키를 모두 폐기했고 새 키의 호출도 막았다. 웹 화면은 정상이었다.
  같은 날 실측에서 브라우저 밖 Node 요청에 `SESSION` 쿠키 하나만 붙여도 웹 API 가 200 으로 응답했다.
  웹 API 는 공개 API 와 경로·응답 꼴이 달랐다. 공개 경로에 `/wapi` 만 붙여 통한 것은 프로젝트 목록 하나였다.
  API 키 방식은 복구될 수 있으므로 지우지 않고 남긴다.
- **대안 기각**:
  - **웹 방식을 읽기 전용으로** — 업무 생성·댓글·위키 수정을 API 복구 때까지 할 수 없다. 사용자가 쓰기 허용을 골랐다(2026-11-13).
  - **apiKey 로 먼저 부르고 401 이면 웹으로 자동 전환** — 호출이 두 번 나가고 어느 쪽이 처리했는지 알 수 없다.
  - **공개 클라이언트를 상속해 경로만 덮기** — 덮지 않은 메서드가 조용히 공개 API 를 부른다. 인터페이스로 나누면 붙이지 않은 메서드가 드러난다.
  - **웹 응답을 그대로 `--json` 에 내기** — 방식을 바꾸면 스킬과 스크립트가 깨진다.
  - **브라우저 쿠키 저장소를 CLI 가 읽기** — 브라우저마다 암호화가 달라 구현이 크고 키체인 권한 창이 뜬다. 사용자가 붙여 넣기를 골랐다.
  - **웹 경로마다 ADR 을 쓰기** — 경로가 수십 개라 ADR 목록에서 찾을 수 없다.
- **결과**:
  - 얻는 것: API 키가 막혀도 같은 명령과 같은 `--json` 으로 일한다. API 가 복구되면 설정 값 하나로 돌아간다.
  - 감당할 것: 웹 경로와 응답이 예고 없이 바뀔 수 있고, 쓰기가 바뀌면 데이터가 의도와 다르게 남을 수 있다. 세션 쿠키는 API 키보다 권한이 넓고 브라우저 로그아웃이나 세션 만료로 무효가 된다. 웹의 호출 한도는 실측하지 않았다. `dooray.com` 이 아닌 세 클라우드의 웹 주소 규칙은 실측하지 않았다.
- **확인 방법**: 웹 HTTP 층과 응답 변환의 단위 테스트, PR 마다 웹 방식으로 돌린 실측 기록(`docs/api/web-endpoints.md`).
