# Phase 01. calendar 명령을 웹 방식으로 돌게 한다

**Execution profile**: standard

## 목표

`calendar list`, `calendar event list·get·create·edit·delete` 가 웹 방식에서 공식 응답 모양으로 돈다. 웹에 대응이 없는 옵션은 설명과 함께 막는다.

**범위 외**: `member get --with-org` 의 소속 조회는 phase 05 가 맡는다. 참석자(`--to`·`--cc`)를 넣는 쓰기는 웹에서 실측하지 못해 지원하지 않는다.

## 컨텍스트

**요구사항**: REQ6, REQ7, REQ8

**근거 문서**: `docs/api/web-endpoints/calendar.md`(경로·쿼리·본문·오류·변환 기준), `docs/features/web-session-auth/design.md` 「웹 HTTP 층」·「응답 변환」

**전제**: PR1 머지 뒤 main 의 `CalendarClient`(`src/api/calendar/types.ts`), `WebContext`·`WebHttp`(`src/api/web/context.ts`, `src/api/web/http.ts`), `src/api/web/convert.ts` 도우미를 쓴다. 꼴이 plan 과 다르면 2단계 시작 때 plan 을 맞춘다.

## 작업 항목

### 1. 응답 고정 파일을 먼저 쓴다

`src/api/web/fixtures/calendar/responses.json` 에 웹 응답의 꼴만 본뜬 가짜 데이터(가짜 id·이름, `example.com`)를 직접 쓴다. 실제 응답을 저장하지 않는다. 캘린더 목록, 일정 목록(일반·반복 회차·종일·참여자 아닌 일정), 일정 상세, 생성·수정·삭제 응답, 기간 초과와 없는 일정(HTTP 200 에 `isSuccessful false`)을 담는다.

### 2. `src/api/calendar/web.ts` 의 `createCalendarWeb(context): CalendarClient`

- 모든 호출에 `Dooray-Api-Version: 1.2` 헤더를 붙인다(ky 호출 옵션 `headers`). 공통 HTTP 층은 바꾸지 않는다.
- `getCalendars`: `GET v2/wapi/calendars?size=99999`. `contents`→`result`, `totalCount` 올림, `me` 는 공식 필드(`default, color, listed, checked, role, order`)만, `subscription` 은 뺀다.
- `getCalendarEvents`: `GET v2/wapi/calendars/*/schedules?timeMin&timeMax`(경로의 `*` 는 인코딩하지 않는다). `references.calendarMap` 으로 `calendar{id,name}` 을 채우고 `users` 는 `{}`, `me` 는 웹 `users.me` 에서 만든다. `recurrenceId` 빈 문자열은 `null`.
- `getCalendarEvent`: `GET v2/wapi/calendars/{calendarId}/schedules/{eventId}`(`apiPath` 로 인코딩). `content` 를 꺼내고 사용자 항목의 `status` 를 항목 위로 올린다. `recurrenceRule` 은 `startedAt`·`endedAt` 을 뺀다.
- `createCalendarEvent`: `POST v2/wapi/schedules` 에 원소 하나 배열을 보낸다. `CalendarEventWriteRequest` 를 웹 본문으로 바꾸는 함수를 둔다(`calendarId`, `resourceId:null`, `category:"general"`, `replyFlag:false`, `recurrenceType`, `fileIdList:[]`, `conferencing:null`, 알림에 `option:null`, `personalSettings.travelTime:null`). `recurrenceType` 값은 `none` 또는 `unmodified` 다. 응답은 `{id}` 만 낸다.
- `updateCalendarEvent`: `PUT v2/wapi/calendars/{calendarId}/schedules/{eventId}`. 요청에 담긴 필드만 보낸다. 응답 `{content}` 는 `result: null` 로 바꾼다.
- `deleteCalendarEvent`: `DELETE …/schedules/{eventId}?deleteType=<값>`. 응답 `result: null`.
- `fetchBusyHours` 는 계약상 구현해야 하므로 `EXIT_PARAM_ERROR`(3)로 끝나는 구현을 둔다. 웹 구현은 phase 05(조건부)가 맡는다.
- 필수 필드(일정 `id`, 캘린더 `id`)를 못 얻으면 `EXIT_API_ERROR` 다.

### 3. `src/api/calendar/web.test.ts`

가짜 `fetch`(또는 `WebHttp` 대역)로 요청의 경로·쿼리·헤더·본문을 확인한다. 고정 파일 응답이 공식 필드 목록(`docs/api/web-endpoints/calendar.md`)과 키·구조·날짜 형식이 같은지 본다. 종일 일정의 `startedAt` 이 `YYYY-MM-DD+09:00`, 반복 회차 id 가 문자열, 없는 키는 만들지 않는 것, 기간 초과·없는 일정이 `EXIT_API_ERROR` 인 것, `deleteType` 세 값을 확인한다.

### 4. 지원 목록 `src/commands/web-support/calendar.ts`

`calendar list`, `calendar event list`, `calendar event get`, `calendar event delete` 는 옵션 제한 없음. `calendar event create`·`calendar event edit` 는 `["to", "cc"]` 를 미지원 옵션으로 둔다(참석자·참조자 쓰기 미실측). `web-support.ts` 가 영역 파일을 모으는 줄과 `src/api/web/index.ts` 의 `calendar` 기본값을 이 영역 구현으로 바꾸는 한 줄만 고친다.

### 5. 명령·resolver 가 영역 계약을 받게 한다

`src/resolvers/calendar.ts`, `src/commands/calendar/**` 가 `DoorayApiClient` 를 직접 만들지 않고 `createClient(config)` 와 `CalendarClient` 타입을 쓰게 한다. 동작은 바꾸지 않는다. `event-create`·`event-edit` 의 멤버 해석(`resolveOrganizationMember`)은 PR1 의 member 웹 구현을 거친다.

### 6. 문서

`docs/guide/calendar.md` 에 「웹 방식에서 지원하지 않는 명령·옵션」 표를 더한다(`event create`·`event edit` 의 `--to`·`--cc`). 빠지는 필드(`files`, `conferencing` 등)와 공식 API 와 다른 점(`category` 미지정 시 일반 일정만)도 적는다.

## 검증

```bash
# cwd: 저장소 루트
pnpm test
pnpm tsc --noEmit
pnpm run build
pnpm api:inventory
node scripts/check-pii.mjs
node scripts/check-public-refs.mjs
```

실제 웹 확인은 `remote-verification.md` 를 따른다.

## 변경 파일

| 파일 | 변경 |
| --- | --- |
| `src/api/calendar/web.ts`, `src/api/calendar/web.test.ts` | 신규 |
| `src/api/web/fixtures/calendar/responses.json` | 신규 |
| `src/commands/web-support/calendar.ts` | 신규 |
| `src/api/web/index.ts` | `calendar` 한 줄 |
| `src/commands/web-support.ts` | 영역 파일 한 줄 |
| `src/commands/calendar/**`, `src/resolvers/calendar.ts` | 클라이언트 생성을 `createClient` 로 |
| `docs/guide/calendar.md` | 웹 방식 지원 표 |
