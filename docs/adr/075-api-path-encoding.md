## ADR-075: API 경로에 넣는 값은 `apiPath` tagged template 으로 모두 인코딩한다

- **status**: `accepted`

- **결정**: `src/api/client.ts` 가 만드는 경로는 `src/api/api-path.ts` 의 `apiPath` 로 조립한다 (Issue #240).
  - **끼워 넣는 값은 모두 `encodeURIComponent` 를 거친다.** `` apiPath`project/v1/projects/${projectId}/posts/${postId}` `` 처럼 쓰면
    값마다 인코딩을 따로 적지 않아도 빠지지 않는다.
  - **ADR-074 의 `enc` 상수는 없앴다.** 첨부 다운로드·업로드 경로도 같은 helper 를 쓴다.
  - **메신저 스레드 생성 경로(`messenger-thread-request.ts`)도 helper 로 만든다.** `client.ts` 밖이지만 같은 `channelId`·`logId` 를 경로에 넣는다.
  - **값이 `""`, `.`, `..` 이면 `DoorayCliError`(`EXIT_PARAM_ERROR`)로 거부한다.** `encodeURIComponent` 는 `.` 를 그대로 두고,
    WHATWG URL 파서는 `%2e%2e` 도 dot segment 로 보고 정규화한다. `getPost("..", "1")` 이 `project/v1/posts/1` 을 부르는 것을
    escape 로는 막을 수 없어서 거부한다. `a..b` 처럼 `..` 가 섞였을 뿐인 값은 segment 가 아니라 통과한다.
  - **helper 에 끼우지 않는 것**: 주소 앞부분(`this.baseUrl`), `searchParams` 로 넘기는 쿼리 값, 고정 경로 리터럴.
    업로드처럼 전체 URL 이 필요한 곳은 `this.baseUrl + apiPath` 로 잇는다.
    이미 인코딩된 값을 받는 호출은 없었다. 경로에 넣는 id 는 모두 호출한 쪽이 준 원문이다.

- **맥락**: ADR-074 는 인증 헤더가 다른 경로로 새는 첨부 흐름만 인코딩하고 나머지는 #240 으로 넘겼다.
  `--id`, URL 입력, 메신저 channelId 처럼 사용자가 준 값이 `/`·`?`·`#` 를 담고 경로까지 가면 의도하지 않은 경로를 부르거나
  뒷부분이 쿼리와 fragment 로 읽힌다. 같은 id 가 경로에 따라 다르게 나가는 것도 막는다.

- **설계 결정**:
  - **tagged template 을 쓴다.** 호출 지점의 모양이 템플릿 문자열 그대로라 diff 가 작고, 값 하나하나에 `enc()` 를 붙이는 것보다 빠뜨리기 어렵다.
  - **숫자 id 는 인코딩해도 같아서 정상 호출의 요청은 바뀌지 않는다.** 기존 테스트의 URL 단언을 고치지 않고 통과한다.
  - **`pnpm api:inventory` 가 `apiPath` 태그를 읽도록 고쳤다.** 태그를 읽지 못하면 모든 호출이 「경로가 리터럴이 아닌 호출」 로 빠져 감사가 비게 된다.
    `this.baseUrl + apiPath` 형태의 업로드 경로도 raw fetch 로 읽는다.

- **대안 기각**:
  - **값마다 `enc()` 를 계속 붙이기** — 새 호출에서 빠뜨려도 알 수 없다.
  - **ky 의 `prefix` 와 `searchParams` 만 믿기** — 경로 조각에는 인코딩이 걸리지 않는다.
