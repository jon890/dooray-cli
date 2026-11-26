# Phase 01. 웹 스트림 변환이 변경 기록 원소와 댓글 시각을 만든다

**Execution profile**: standard

## 목표

웹 방식 `getStreams` 가 지금 버리는 변경 기록을 원소로 만들고, `withChanges` 에 따라 `result` 나 `changes` 에 나눠 담는다. 업무 댓글 원소에 시각을 넣는다.

**범위 외**: `stream list` 명령의 옵션, 건수 안내, 표 요약과 이름 채우기, 문서 갱신은 phase 02 가 한다.

## 컨텍스트

**요구사항**: REQ1, REQ2, REQ3, REQ4

**근거 문서**: `docs/features/stream-change-records/spec.md`, `docs/features/stream-change-records/design.md` 「인터페이스와 데이터」·「실패와 일관성」, `docs/adr/083-web-only-stream-elements.md`, `docs/api/web-endpoints/stream.md`

- 변환은 `src/api/stream/web.ts` 의 `convertStreamCards(cards, references)` 와 `createStreamWeb(context)` 가 한다. 웹 카드는 종류와 id 만 담고 내용은 `references` 의 맵(`eventMap`, `pageEventMap`, `organizationMemberMap` 등)에 있다.
- 지금 동작: 업무 카드의 `eventList` 중 `body.mimeType` 이 문자열이 아닌 항목, 위키 카드의 `pageEventMap` 항목, `calendar`·`project` 같은 모르는 카드, 일정 카드의 `eventList` 를 버리고 `dropped` 로 센다. 첫 번째로 버린 페이지에서 `process.stderr.write` 로 경고한다.
- 공통 변환 도우미는 `src/api/web/convert.ts` 의 `row`, `rows`, `identifier`, `text`, `date`, `pick`, `invalidResponse` 다. `row`·`identifier`·`text`·`date` 는 모양이 틀리면 `invalidResponse()` 로 예외를 던진다. `date(null)` 은 `null` 을 돌려주고 `undefined` 는 예외다.
- 웹 구현 공용 상태는 `src/api/web/context.ts` 의 `WebContext` 이고 `memberNames: Map<string, string>` 이 멤버 이름 캐시다. `src/api/member/web.ts` 의 `getMemberNameFromList` 가 이 캐시를 읽는다.
- 계약은 `src/api/stream/types.ts` 의 `GetStreamsParams`, `StreamListResponse`, `StreamClient` 다. 공개 구현 `src/api/stream/public.ts` 는 `size`, `before`, `read` 만 골라 쿼리로 보내므로 `withChanges` 가 서버로 나가지 않는다. 고치지 않는다.
- 테스트는 `src/api/stream/web.test.ts` 가 `src/api/web/fixtures/stream/responses.json` 의 `page`, `empty` 응답을 `fetch` 스텁으로 돌려준다. fixture 의 `page.result.references.eventMap["event-nobody"]` 가 본문 없는 시스템 기록 예시다.
- 2026-11-16 실측 모양(스펙 「배경」): 시스템 기록 `body.actions[]` 원소는 `name`, `type`, `message`, `data` 를 가진다. `workflow` 의 `data.before/after.names[]` 에 `{name, locale}` 이 있다. `endedAt` 은 `data.after` 만 있다. `pageEventMap` 항목은 `{type: "pageEvent", id, pageId, body: {actions}, createdAt, creator: {type, member: {organizationMemberId, name}}}` 이다. `calendar` 카드는 `{id, type, calendar: {id, source: {organizationMemberId, type}, target: {schedule: {subject}}, action: {type}, at}}`, `project` 카드는 `{id, type, project: {id, source: {organizationMemberId}, action, actionDetail: {type}, at}}` 이다. `at` 은 `2026-11-14T11:26:36+0900` 처럼 콜론 없는 오프셋이다. `eventMap` 의 댓글 수정 시각은 `modifiedAt` 이고 대개 `null` 이다.

## 의도 메모

- 옵션이 없어도 변경 기록을 만든다. phase 02 가 `--since` 범위 안의 건수를 세려면 원소 시각이 필요하다(설계 DECISION1).
- `pageEvent`, `calendar`, `project` 는 웹 값을 그대로 낸다. 이름을 채우거나 필드를 고치지 않는다(스펙 DECISION6, ADR-083). 표에 쓸 이름은 `organizationMemberMap` 을 `context.memberNames` 에 넣어서만 제공한다.
- 변경 기록 변환 중 맵 누락이나 모양 오류는 예외를 던지지 않고 `unknown` 으로 센다. 옵션이 없는 호출에 새 실패 경로를 만들지 않는다(설계 DECISION4). 공개 API 종류 원소의 기존 오류 처리는 그대로 둔다.
- 기각: 변경 기록에 서버에 없는 `body.content` 요약을 넣기(ADR-083 대안 기각).

## 작업 항목

### 1. `src/api/stream/types.ts` 계약

- `GetStreamsParams` 에 `withChanges?: boolean` 을 더한다. 주석: 웹 구현만 읽고 서버로 보내지 않는다.
- `StreamListResponse` 에 `changes?: StreamItem[]`, `unknown?: number` 를 더한다. 주석: 웹 구현만 채운다. `changes` 는 `withChanges` 가 아닐 때 `result` 에서 뺀 변경 기록, `unknown` 은 CLI 가 모르는 항목 수다. `--json` 출력에 나가지 않는다.

### 2. `src/api/stream/web.ts` 변환

`convertStreamCards(cards, references, withChanges: boolean)` 의 반환을 `{ items: StreamItem[]; changes: StreamItem[]; unknown: number; memberNames: Map<string, string> }` 꼴로 바꾼다. 변경 기록은 `withChanges` 면 `items` 에 카드 순서대로, 아니면 `changes` 에 넣는다.

- 시각 도우미 `optionalTime(value: unknown): string | undefined` 를 `web.ts` 안에 둔다. 값이 문자열이 아니면 `undefined`, 문자열이면 `date(value)` 를 부르고 예외가 나면 `undefined` 를 돌려준다. 이 도우미 안의 try/catch 는 허용한다.
- 업무 댓글(`body.mimeType` 이 문자열): 기존 원소에 `createdAt: optionalTime(ev.createdAt)`, `updatedAt: optionalTime(ev.modifiedAt)` 을 더한다. 값이 `undefined` 면 키를 넣지 않는다. 키 순서는 `read, id, type, postId, creator, body, createdAt, updatedAt` 으로 둔다.
- 업무 시스템 기록(`body.mimeType` 이 문자열이 아님): `{type: "event", event: {read, id, type, postId, creator, createdAt, updatedAt?, actions}}`. `createdAt` 은 `optionalTime(ev.createdAt)` 이고 `undefined` 면 그 기록을 `unknown` 으로 센다(설계 「인터페이스와 데이터」). `updatedAt` 은 `optionalTime(ev.modifiedAt)` 이 있을 때만 넣는다. `actions` 는 `body.actions` 가 배열이면 그 값 그대로, 아니면(`body` 가 없을 때 포함) `[]`. `body` 키는 넣지 않는다.
- 일정 카드의 `eventList` 항목: `eventMap` 에서 찾아 본문 글이 없으면 위와 같은 모양에 `postId` 대신 `scheduleId` 를 둔다. 본문 글이 있으면 `unknown` 에 센다(설계 DECISION3).
- 위키 카드의 `pageEventMap` 항목: `{type: "pageEvent", pageEvent: <맵 항목 그대로>}`. 항목의 `createdAt` 이 `optionalTime` 으로 읽히지 않으면 `unknown` 이다. `pageCommentMap` 처리는 그대로 둔다.
- 하위 항목(업무·위키·일정 카드의 `eventList` 원소)이 해당 맵에 없으면 카드 종류와 상관없이 `unknown` 으로 센다. 지금 업무 하위 항목은 `entry()` 가, 위키 하위 항목은 `invalidResponse()` 가 예외를 던지는데 이것을 바꾼다(설계 DECISION4). 카드 자체가 `postMap`·`pageMap`·`scheduleMap`·`mailMap` 에 없을 때는 지금처럼 `entry()` 의 예외를 둔다.
- `calendar` 카드: `{type: "calendar", calendar: <card.calendar 그대로>}`. `project` 카드: `{type: "project", project: <card.project 그대로>}`.
- 그 밖의 카드 종류는 `unknown` 에 센다.
- 변경 기록 하나를 만드는 동안 `convert.ts` 도우미가 예외를 던지면 그 항목을 `unknown` 으로 센다. 이 try/catch 는 변경 기록 하나의 변환과 `optionalTime` 에만 둔다. 공개 API 종류 원소(mail, post, 댓글 event, page, pageComment, schedule)의 변환은 감싸지 않는다.
- `organizationMemberMap` 은 멤버 id 를 키로, 멤버 상세(`id`, `name` 등 웹 멤버 모양)를 값으로 가진다(2026-11-16 실측). 각 항목의 `id` 와 `name` 이 문자열이면 `memberNames` 에 담고, 아니면 건너뛴다.

`createStreamWeb` 의 `getStreams`:

- `params?.withChanges === true` 를 `convertStreamCards` 에 넘기고 `withChanges` 는 쿼리에 넣지 않는다.
- `memberNames` 를 `context.memberNames` 에 합친다.
- `warned` 와 `process.stderr.write` 경고를 없앤다.
- 빈 `items` 로 다음 페이지를 이어 받는 반복에서 각 페이지의 `changes` 와 `unknown` 을 모아, 돌려주는 응답에 `changes`, `unknown` 으로 둔다. 원본 카드가 빈 페이지와 커서 반복으로 끝날 때도 모은 값을 담는다.

### 3. `src/api/web/fixtures/stream/responses.json`

`page` 응답에 아래를 더한다. id 와 이름은 가짜 값(`member-3`, `홍길동` 꼴)만 쓴다.

- `event-nobody` 에 `createdAt` 과 `body.actions` 하나(`workflow`, `ko_KR` 이름이 있는 before/after)
- 업무 댓글 `comment-1` 에 `createdAt`, `modifiedAt: null`
- 위키 카드 `eventList` 의 `pageEventMap` 항목 하나(`본문 변경`)
- `calendar` 카드 하나(`schedule_deleted`, `at` 은 `+0900` 꼴), `project` 카드 하나(`invited`)
- 일정 카드 `eventList` 의 `eventMap` 항목 하나(본문 글 없음, `scheduleId`)
- `organizationMemberMap` 에 `calendar`·`project` 의 `source` 멤버

### 4. `src/api/stream/web.test.ts`

- 기존 「카드를 공식 원소로 바꾸고…」 테스트의 `event.event` 기대값에 `createdAt` 을 더하고 `updatedAt` 키가 없음을 확인한다. 옵션 없이 부를 때 원소 종류 순서가 기존과 같은지 확인한다.
- 기존 「본문이 없는 시스템 이벤트는 … 건너뛴다」 테스트를 「옵션이 없으면 변경 기록은 `result` 가 아니라 `changes` 에 있다」 로 바꾼다. `changes` 의 종류와 `unknown` 건수를 단언한다.
- 기존 「공식 종류에 없는 항목을 빼고 처음 한 번만 stderr 로 알린다」 테스트(`web.test.ts` 70행 근처)는 stderr 경고가 없어지므로, 「모르는 카드 종류는 `unknown` 으로 세고 stderr 에 쓰지 않는다」 테스트로 바꾼다.
- `withChanges: true` 일 때 `result` 의 종류 순서, 시스템 기록 `event` 의 `actions` 와 `body` 키 없음, 일정 기록의 `scheduleId`, `pageEvent`·`calendar`·`project` 원소가 fixture 값과 `toEqual` 로 같음을 확인한다.
- `withChanges` 가 쿼리에 없음을 확인한다.
- `organizationMemberMap` 이름이 `getMemberNameFromList` 로 보이는지 확인한다.
- 실패 입력(테스트 안에서 fixture 를 복제해 고친다): `eventMap` 에 없는 업무 하위 항목, 두 맵에 모두 없는 위키 하위 항목, `eventMap` 에 없는 일정 하위 항목, `createdAt` 이 `null` 인 시스템 기록, `createdAt` 이 객체(`{}`)인 시스템 기록이 모두 예외 없이 `unknown` 으로 세어지는지 확인한다. 댓글의 `createdAt` 이 `null` 이면 댓글 원소는 남고 `createdAt` 키만 없는지도 확인한다.
- stderr 에 아무것도 쓰지 않음을 확인한다.

## 검증

```bash
pnpm vitest run src/api/stream/web.test.ts src/architecture.test.ts
pnpm tsc --noEmit
node scripts/check-pii.mjs
```

기대값: 모두 종료 코드 0. phase 02 전이라 `src/commands/stream/list.test.ts` 는 이 phase 에서 고치지 않는다. 그 테스트가 `getStreams` 계약 변경으로 깨지면 같은 커밋에서 기대값만 맞추고 변경 파일 표에 더한다.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `src/api/stream/types.ts` | 수정 |
| `src/api/stream/web.ts` | 수정 |
| `src/api/web/fixtures/stream/responses.json` | 수정 |
| `src/api/stream/web.test.ts` | 수정 |
