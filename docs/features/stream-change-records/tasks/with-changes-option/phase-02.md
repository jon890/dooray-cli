# Phase 02. stream list 가 --with-changes 와 변경 기록 안내, 표 요약을 낸다

**Execution profile**: standard

## 목표

`stream list` 에 `--with-changes` 를 더하고, 옵션이 없을 때 뺀 변경 기록 건수를 알리며, 표에 변경 내용과 한 사람 이름을 보인다. 관련 문서를 같은 커밋에서 갱신한다.

**범위 외**: 웹 변환(phase 01 에서 끝남). 공개 API 방식의 응답 모양.

## 컨텍스트

**요구사항**: REQ2, REQ5, REQ6, REQ7

**근거 문서**: `docs/features/stream-change-records/spec.md`, `docs/features/stream-change-records/design.md` 「인터페이스와 데이터」·「실패와 일관성」·「문서 변경」, `docs/adr/083-web-only-stream-elements.md`

- phase 01 뒤 계약: `GetStreamsParams.withChanges?: boolean`, `StreamListResponse.changes?: StreamItem[]`, `StreamListResponse.unknown?: number` (`src/api/stream/types.ts`). 웹 구현은 옵션이 없으면 변경 기록을 `changes` 에 두고, 응답 안의 멤버 이름을 `getMemberNameFromList` 로 보이게 한다. 웹 구현은 더 이상 stderr 에 쓰지 않는다.
- 변경 기록 원소 모양은 설계 「인터페이스와 데이터」 표가 정한다. 시스템 기록 `event` 는 `actions` 키가 있고 `body` 키가 없다. `pageEvent` 는 `body.actions`, `calendar` 는 `action.type`·`target.schedule.subject`·`source.organizationMemberId`·`at`, `project` 는 `action`·`source.organizationMemberId`·`at` 을 가진다.
- 페이지 넘기기는 `src/commands/stream/feed.ts` 의 `fetchStreams(client, opts)` 다. `--since` 는 원소 시각(`streamItemAt`)으로 원소를 고르고 커서로 멈춘다. 빈 `result` 를 받으면 곧바로 끝낸다.
- 표 헬퍼는 같은 파일의 `streamItemAuthor`, `streamItemSummary` 다. 공개 API 방식의 원소도 이 헬퍼를 쓰므로 기존 요약을 깨지 않아야 한다. 공개 API `project` 원소는 `{id, name, actor: {organizationMemberId}, action: "invited", actionDetail, at}` 이다(`src/commands/stream/fixtures/streams-pages.json`, `list.test.ts` 의 「제목이 없으면…」 근처 단언은 요약이 `name` 이다). 웹 `project`·`calendar` 카드는 `actor` 대신 `source` 를 가진다. 이 차이로 둘을 구분한다.
- 명령은 `src/commands/stream/list.ts` 의 `streamListCommand` 다. 설정은 `getConfigOrThrow()`, 클라이언트는 `createClient(config)`(`src/api/dooray-client.ts`)로 얻는다. 웹 방식이면 `config.authMode === "web"` 이다. 클라이언트에는 `getMemberNameFromList?(id)` 와 `getMemberDetail(id)` 가 있다(`src/api/member/types.ts`).
- 표 시각 칸은 `src/formatters/datetime.ts` 의 `formatSentAt` 이 `+09:00` 만 줄인다. `calendar`·`project` 의 `at` 은 `+0900` 이다.
- `CLAUDE.md` 「명령 공통 규약」 의 「무시되는 옵션: 다른 옵션 때문에 효력이 없어진 옵션은 무시하고 stderr 로 경고한다」 를 따른다.
- 테스트 `src/commands/stream/list.test.ts` 는 `../../config/store.js` 와 `../../api/client.js` 를 `vi.mock` 하고 `src/commands/stream/fixtures/streams-pages.json` 을 쓴다. 이 phase 에서는 모킹을 아래처럼 바꾼다.
  - `mocks` 에 `webClient: { getStreams: vi.fn(), getMemberNameFromList: vi.fn(), getMemberDetail: vi.fn() }` 를 더한다.
  - `vi.mock("../../api/dooray-client.js", () => ({ createClient: (config: { authMode?: string }) => (config.authMode === "web" ? mocks.webClient : mocks.client) }))` 를 더한다. 기존 `../../api/client.js` 모킹은 지운다(더 이상 거치지 않는다). 기존 테스트는 `getConfigOrThrow` 가 `authMode` 없는 설정을 돌려주므로 `mocks.client` 를 그대로 받는다.
  - 변경 기록이 섞인 가짜 페이지는 테스트 파일 안에 인라인 상수로 둔다. `streams-pages.json` 은 고치지 않는다.

## 의도 메모

- 이름은 `--json` 원소에 넣지 않는다. 표를 그릴 때만 찾는다(ADR-083, 설계 DECISION2). `--json`, `--quiet` 에서는 이름 조회를 하지 않는다.
- 이름 조회가 실패해도 명령은 성공으로 끝낸다. 그 칸에 멤버 id 를 보이고 stderr 로 한 번 경고한다(설계 DECISION7).
- 기본 한 페이지 모드에서 첫 페이지가 변경 기록뿐이면 건수가 어긋나는 것을 받아들인다(설계 DECISION8).
- 문서에는 계획서 경로를 적지 않는다. 근거는 ADR-083 과 기능 문서로 적는다.

## 작업 항목

### 1. `src/commands/stream/feed.ts`

- `FetchStreamsOptions` 에 `withChanges?: boolean` 을 더하고 `client.getStreams` 에 그대로 넘긴다.
- `FetchStreamsResult` 에 `hiddenChanges: number`, `unknown: number` 를 더한다.
- 각 응답에서 빈 `result` 로 끝내기 전에 `changes` 와 `unknown` 을 먼저 센다. `changes` 원소는 `result` 원소와 같은 `--since` 규칙(원소 시각이 `sinceMs` 이상, 시각이 없으면 그 페이지 커서가 `sinceMs` 이상)을 통과한 것만 센다. 규칙은 함수 하나로 뽑아 두 곳이 같이 쓴다.
- `streamItemAuthor`: 지금 순서(`creator`, `users.from`, `actor`) 뒤에 이름을 못 찾으면 빈 문자열이다. 그대로 둔다. `source` 이름은 명령이 채운다.
- `streamChangeSourceId(item)`: `calendar`·`project` 원소의 `source.organizationMemberId` 를 돌려준다. 아니면 `undefined`.
- `streamItemSummary`: `type === "event"` 이고 모델에 `actions` 배열이 있거나, `type === "pageEvent"` 이고 `body.actions` 배열이 있거나, `type` 이 `calendar`·`project` 이고 모델에 `source` 키가 있을 때만 변경 요약을 쓴다. 아니면 기존 규칙 그대로다. 공개 API `project`(`actor`, `action`, `name`)와 댓글 `event` 는 기존 요약이다. 변경 요약은 설계 「표 요약」 표를 따른다.
  - 항목 이름은 `message` 에서 「: 변경」 앞부분이다(스펙 DECISION13). `message` 에 「: 」 가 없으면 `message` 전체, `message` 가 없으면 `name`.
  - `workflow`: 「<이름>: <전 상태 이름> → <후 상태 이름>」. 상태 이름은 `names[]` 의 `locale === "ko_KR"`, 없으면 첫 이름. 전이나 후의 상태 이름이 없으면 `message`.
  - `endedAt`: 「<이름>: <data.after 의 YYYY-MM-DD>」. 값이 문자열이 아니면 `message`.
  - `subject`: 「<이름>: <before> → <after>」. 둘 중 하나라도 문자열이 아니면 `message`.
  - 그 밖: `message`. `message` 도 없으면 `name`.
  - 여러 개면 `, ` 로 잇는다.
  - `calendar`: `action.type === "schedule_deleted"` 면 「일정 삭제: <target.schedule.subject>」, 제목이 없으면 「일정 삭제」, 모르는 값이면 `action.type`.
  - `project`: `action === "invited"` 또는 `actionDetail.type === "invited"` 면 「프로젝트 초대」, 아니면 그 값.

### 2. `src/commands/stream/list.ts`

- `.option("--with-changes", "웹 방식만. 업무 상태 변경, 위키 활동, 일정 삭제 알림 같은 변경 기록을 웹 응답 모양 그대로 함께 낸다")` 를 더한다. `StreamListOptions` 에 `withChanges?: boolean`.
- 설정을 읽은 뒤 `opts.withChanges && config.authMode !== "web"` 이면 `⚠  --with-changes 는 웹 방식에서만 동작합니다. 무시합니다.` 를 stderr 로 한 번 쓰고 옵션을 끈 채 진행한다.
- `fetchStreams` 에 `withChanges` 를 넘긴다.
- 표 출력일 때만: `streamChangeSourceId` 가 있는 원소의 id 를 모아 중복 없이 이름을 찾는다. `client.getMemberNameFromList?.(id)` 가 있으면 쓰고, 없으면 `client.getMemberDetail(id)` 로 한 번 찾는다. 실패하면 id 를 이름 자리에 쓰고 `⚠  작성자 이름을 찾지 못해 멤버 id 로 보입니다.` 를 한 번 쓴다. 작성자 칸은 `streamItemAuthor(item) || <찾은 이름>` 이다.
- 출력(stdout)을 다 쓴 뒤 stderr 로: `hiddenChanges > 0` 이면 `ℹ  변경 기록 N건을 뺐습니다. --with-changes 로 함께 봅니다.`, `unknown > 0` 이면 `ℹ  웹 응답에 CLI 가 모르는 항목 N건이 있어 뺐습니다.` 를 낸다. `--json`, `--quiet`, 빈 결과에서도 같다.

### 3. `src/formatters/datetime.ts`

`formatSentAt` 의 정규식이 `+09:00` 과 `+0900` 을 모두 받게 한다. 다른 오프셋은 지금처럼 그대로 둔다.

### 4. 테스트

`src/commands/stream/list.test.ts`:

- `fetchStreams` 가 `withChanges` 를 `getStreams` 로 넘기는지
- `changes` 가 `--since` 경계 앞뒤에 걸친 페이지에서 `hiddenChanges` 가 경계 안의 것만 세는지, 빈 `result` 응답의 `changes` 와 `unknown` 도 세는지
- `streamItemSummary` 가 시스템 기록 `event`(workflow·endedAt·subject·그 밖, 여러 개, `ko_KR` 없음), `pageEvent`, 웹 `calendar`(삭제, 제목 없음, 모르는 값), 웹 `project` 를 설계대로 요약하고, 공개 API `project`(`streams-pages.json` 의 원소, `actor`·`action: "invited"`·`name` 이 있음)는 `name` 을, 댓글 `event` 는 본문을 그대로 요약하는지
- `--since` 를 줄 때 페이지 커서는 since 이후지만 자기 `createdAt` 이 since 이전인 댓글 `event` 가 빠지고, `createdAt` 이 없는 댓글은 지금처럼 커서로 판단되는지
- 웹 방식 명령: `--with-changes` 를 준 표 출력의 작성자 칸에 `getMemberNameFromList` 이름이 보이고, 캐시에 없는 사람은 `getMemberDetail` 을 사람마다 한 번만 부르는지, 조회 실패 때 id 와 경고 한 번
- 웹 방식 명령: 옵션이 없을 때 끝에 건수 안내가 한 번, `--json` 에도 안내는 stderr 로만 나오고 stdout JSON 에 `changes` 가 없는지
- 웹 방식 `--quiet --with-changes` 가 변경 기록 id 도 한 줄씩 내는지
- 공개 API 방식에서 `--with-changes` 경고 한 번과 출력이 옵션 없을 때와 같은지

`src/formatters/datetime.test.ts`: `+0900` 입력이 `YYYY-MM-DD HH:MM` 으로, 다른 오프셋은 그대로인지.

### 5. 문서

- `CLAUDE.md` 「명령 공통 규약」 의 「출력」 항목 아래에, ADR-056 하위 줄과 같은 꼴로 한 줄: `stream list --with-changes` 는 공개 API 에 없는 웹 변경 기록을 웹 모양 그대로 낸다는 예외와 `[ADR-083](docs/adr/083-web-only-stream-elements.md)` 링크.
- `docs/code-architecture.md` 「출력 원칙」 의 `--json` 줄에 같은 예외를 한 줄로 덧붙인다.
- `docs/api/web-endpoints/stream.md`: 「웹에만 있어 낼 수 없는 것」 의 「캘린더 공유 알림」 을 일정 삭제 알림으로 고치고(2026-11-16 실측), 「뺀다」 서술을 「`--with-changes` 를 줄 때만 낸다」 로 바꾼다. 변경 기록 원소 모양과 `actions` 의 `name`·`message`·`data` 모양, `organizationMemberMap` 사용, 댓글 `createdAt`·`modifiedAt` 을 한 절로 더하고 ADR-083 을 링크한다.
- `docs/flow.md` 의 `stream list` 절: 다이어그램 입력 노드에 `--with-changes` 를 더하고, 출력 뒤 「변경 기록 건수 안내(웹 방식, 옵션이 없을 때)」 를 한 줄 설명으로 더한다. 공개 API 경로 노드는 그대로 두고 웹 방식은 `GET /v2/wapi/streams` 라고 설명 줄에 적는다.
- `docs/guide/setup.md` 의 웹 방식 차이 표 `stream list` 행: 변경 기록은 기본으로 빠지고 끝에 건수를 알려 주며 `--with-changes` 로 함께 볼 수 있다고 고친다. 「캘린더 공유 알림」 표현을 없앤다.
- `skills/dooray-cli/SKILL.md` 의 `stream list` 행들에 한 줄을 더한다: `dooray stream list --with-changes` — 웹 방식만. 업무 상태 변경, 위키 활동, 일정 삭제 알림을 함께 낸다. `--json` 은 웹 응답 모양이고 `project` 원소는 공개 API 모양과 다를 수 있다.
- `README.md` 「자주 쓰는 명령」 코드 블록에 `dooray stream list --since prev-1d --with-changes   # 상태 변경까지 포함한 하루 활동` 꼴로 한 줄.

## 검증

```bash
pnpm vitest run src/commands/stream/list.test.ts src/formatters/datetime.test.ts src/api/stream/web.test.ts src/architecture.test.ts
pnpm test
pnpm tsc --noEmit
pnpm run build
node scripts/check-pii.mjs
node scripts/check-public-refs.mjs
```

기대값: 모두 종료 코드 0. 빌드 뒤 `node dist/index.js stream list --help` 에 `--with-changes` 가 보인다.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `src/commands/stream/feed.ts` | 수정 |
| `src/commands/stream/list.ts` | 수정 |
| `src/formatters/datetime.ts` | 수정 |
| `src/commands/stream/list.test.ts` | 수정 |
| `src/formatters/datetime.test.ts` | 수정 |
| `CLAUDE.md` | 수정 |
| `docs/code-architecture.md` | 수정 |
| `docs/flow.md` | 수정 |
| `docs/api/web-endpoints/stream.md` | 수정 |
| `docs/guide/setup.md` | 수정 |
| `skills/dooray-cli/SKILL.md` | 수정 |
| `README.md` | 수정 |
