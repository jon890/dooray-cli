# Phase 01 — 수집 공용 모듈 `lib/dooray.mjs` 와 단위 테스트

**Execution profile**: standard

---

## 목표

`skills/dooray-persona/scripts/lib/dooray.mjs` 를 만든다.
이 스킬의 모든 스크립트가 Dooray 를 호출하는 유일한 통로이며, 속도 제어와 조용한 실패 감지를 이 한 곳에 가둔다.

이 스킬은 `dooray` CLI 를 subprocess 로 부르지 않고 REST 를 직접 호출한다.
수천 건을 훑는 워크로드라 프로세스 기동 비용을 감당할 수 없고, 전역 속도 제어를 걸 지점이 필요하기 때문이다.

**범위 외**: 실제 수집·분류·문서 생성 스크립트는 phase 02·03 의 책임이다. 이 phase 는 모듈과 테스트만 만든다.

---

## 배경 — 반드시 지켜야 할 API 사실

`docs/adr/037-bulk-post-collection-pitfalls.md` 에 근거가 있다. 요약하면 셋이다.

- 담당자가 개인이 아니라 팀 그룹으로 걸린 업무가 많다. `users.to[].member` 만 보면 실측에서 254건 중 253건이 빠졌다.
  `users.to[].group.members[]` 와 `users.cc` 까지 봐야 한다. 이 정보는 목록 응답에 이미 있어 추가 호출이 필요 없다.
- 초당 5회를 넘기면 오류가 아니라 **빈 결과**가 온다. 호출자가 성공으로 받아들여 수집이 조용히 빈다.
- 목록 응답에는 `body` 가 없다. 본문은 건별 조회해야 한다.

인증 헤더는 `src/api/client.ts` 와 같은 형식이다 — `Authorization: dooray-api <apiKey>`.

---

## 작업 항목 (3)

### 1. `skills/dooray-persona/scripts/lib/dooray.mjs` — 신규

의존성 없는 Node ESM 으로 작성한다. Node 20 내장 `fetch` 를 쓰고 외부 패키지를 추가하지 않는다.

내보낼 함수는 다음과 같다.

| 함수 | 시그니처와 계약 |
| --- | --- |
| `loadApiConfig` | `(configPath?) => { apiKey, baseUrl }`<br>기본 경로는 `~/.dooray/config.json`<br>파일이 없거나 `apiKey` 가 비면 `dooray setup` 실행을 안내하는 메시지로 `Error` 를 던진다<br>이 파일을 **읽기만** 한다. 절대 쓰지 않는다 |
| `createRateLimiter` | `(rps, { now, sleep } = {}) => async () => void`<br>`now` 와 `sleep` 을 주입 가능하게 열어 테스트가 실제 시간을 기다리지 않게 한다<br>기본값은 `Date.now` 와 `setTimeout` 기반 sleep |
| `createClient` | `({ apiKey, baseUrl, rps = 4 }) => { get(path, searchParams) }`<br>리미터 인스턴스를 클로저에 가둬 이 클라이언트를 거치는 모든 호출이 하나의 예산을 공유한다<br>`get` 은 `Authorization` 헤더를 붙이고 JSON 을 파싱해 응답 객체를 그대로 반환한다<br>HTTP 4xx·5xx 는 상태 코드와 본문 일부를 담은 `Error` 로 올린다 |
| `getAllPages` | `(client, path, searchParams = {}, { size = 100, maxPages = Infinity } = {}) => Promise<Array>`<br>`page` 를 0부터 올리며 `result` 를 누적하고 `totalCount` 에 도달하면 멈춘다<br>**빈 결과 감지** — 어떤 페이지가 `totalCount > 0` 인데 `result.length === 0` 이면 속도 제한으로 보고 1초 뒤 최대 2회 재시도한다. 그래도 비면 `Error` 를 던진다 |
| `getMe` | `(client) => { organizationMemberId, name }`<br>`common/v1/members/me` 응답의 `result` 에서 뽑는다 |
| `listProjects` | `(client) => [{ id, code, name }]`<br>`project/v1/projects?member=me` 를 `getAllPages` 로 훑는다 |
| `listPosts` | `(client, projectId, { since = null, maxPages } = {}) => Post[]`<br>`project/v1/projects/{projectId}/posts` 를 `order=-createdAt` 으로 훑는다<br>`since` 가 있으면 `createdAt` 이 그보다 오래된 항목을 만난 시점에 조기 종료한다 (정렬이 최신순이므로 그 뒤는 모두 오래된 것이다) |
| `getPost` | `(client, projectId, postId) => PostDetail`<br>`.../posts/{postId}` 의 `result` |
| `listComments` | `(client, projectId, postId) => Comment[]`<br>`.../posts/{postId}/logs` 를 `getAllPages` 로 훑는다 |
| `classifyInvolvement` | `(post, memberId) => { authored, assigned, cc, assigneeKind }` |

`classifyInvolvement` 판정 규칙을 정확히 지킨다.

- `authored` — `post.users.from?.member?.organizationMemberId === memberId`
- `assigned` — `post.users.to` 각 항목에서 `member.organizationMemberId === memberId` 이거나 `group.members[]` 안에 그 id 가 있으면 참
- `cc` — `post.users.cc` 에 같은 규칙을 적용
- `assigneeKind` — `to` 가 비어 있으면 `"none"`, 본인이 개인 담당으로 잡혔으면 `"member"`, 그룹 경유로만 잡혔으면 `"group"`
- `users` 나 하위 배열이 없을 수 있다. 모든 접근에 옵셔널 체이닝과 기본 빈 배열을 쓴다

### 2. `skills/dooray-persona/scripts/lib/dooray.test.mjs` — 신규

`vitest` 로 돌아간다. 이 저장소에는 vitest 설정 파일이 없어 기본 include 가 `**/*.test.mjs` 를 이미 잡는다.
설정 파일을 새로 만들지 않는다.

최소한 다음을 덮는다.

- `classifyInvolvement` — 그룹 담당만 걸린 업무에서 `assigned` 가 참이고 `assigneeKind` 가 `"group"` 이다
- `classifyInvolvement` — 개인 담당이면 `assigneeKind` 가 `"member"` 다
- `classifyInvolvement` — 참조자로만 걸리면 `cc` 만 참이다
- `classifyInvolvement` — `users` 가 없는 업무에서 예외 없이 전부 거짓을 반환한다
- `getAllPages` — `totalCount` 가 0보다 큰데 `result` 가 빈 응답을 계속 주는 가짜 client 에 대해 재시도 후 `Error` 를 던진다
- `getAllPages` — 두 페이지에 걸친 응답을 이어 붙여 `totalCount` 만큼 반환한다
- `createRateLimiter` — 주입한 `now`·`sleep` 으로, 초당 한도를 넘는 호출에서 `sleep` 이 호출된다

테스트 fixture 의 식별자는 전부 가짜 값을 쓴다.
`CLAUDE.md` 의 "개인 식별 정보 / 사내 식별자 노출 금지" 표에 있는 허용 dummy id 를 그대로 쓰고, 프로젝트 코드는 `my-project` 같은 가상 값만 쓴다.

### 3. 디렉터리 생성

`skills/dooray-persona/scripts/lib/` 까지 만든다. 다른 하위 디렉터리는 이후 phase 에서 만든다.

---

## Critical Files

| 파일 | 변경 |
| --- | --- |
| `skills/dooray-persona/scripts/lib/dooray.mjs` | 신규 |
| `skills/dooray-persona/scripts/lib/dooray.test.mjs` | 신규 |

## 검증

```bash
# cwd: <repo root>
pnpm test -- skills/dooray-persona
node --check skills/dooray-persona/scripts/lib/dooray.mjs
```

- 위 테스트가 전부 통과한다.
- `node --check` 가 오류 없이 끝난다.
- 아래 grep 이 0건이다 — 외부 의존을 넣지 않았음을 확인한다.

```bash
# cwd: <repo root>
grep -nE "^import .* from \"(?!node:)" skills/dooray-persona/scripts/lib/dooray.mjs || true
grep -n "require(" skills/dooray-persona/scripts/lib/dooray.mjs || true
```

## 의도 메모 (왜)

- 속도 제어를 스크립트마다 두지 않고 클라이언트 클로저에 가두는 이유는, 나중에 병렬 수집을 붙여도 예산이 저절로 공유되기 때문이다. 스크립트가 각자 리미터를 만들면 합산 속도가 한도를 넘는다.
- 빈 결과 감지를 호출자가 아니라 `getAllPages` 에 두는 이유는, 조용한 실패를 라이브러리 경계에서 끊어야 호출자가 잊어버릴 수 없기 때문이다.
- `now`·`sleep` 을 주입 가능하게 여는 이유는, 시간에 의존하는 테스트가 CI 에서 불안정해지기 때문이다.
