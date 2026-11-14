# calendar 웹 경로 실측

2026-11-14 실측했다. 공통 규칙과 공식 문서는 [색인](../web-endpoints.md)에 있다.
쓰기는 내 개인 캘린더에 `[cli-web-probe]` 제목으로 만들고 같은 실측에서 지웠다. 참석자는 넣지 않았다. 실측을 마친 뒤 남은 `[cli-web-probe]` 일정은 0건이다.

## 요청 헤더

캘린더 경로(`/v2/wapi/...`)는 `Dooray-Api-Version: 1.2` 헤더가 있어야 공식 응답에 가까운 모양을 준다. 웹 화면이 보내는 값이다.

| 헤더 | 캘린더 목록 응답의 차이 |
| --- | --- |
| 없음, `1.1` | 항목이 평평하다(`permission`, `color`, `listed`, `checked`, `default` 가 항목에 바로 있다). `totalCount` 가 없다 |
| `1.2` | 항목에 `me` 객체(`role`, `color`, `listed`, `checked`, `order`, `default` …)가 있고 `result.totalCount` 가 있다. 공식 응답의 모양이다 |

`Dooray-Caller: WEB` 은 응답에 영향이 없었다. 메신저 경로(`/messenger/...`)는 이 헤더를 보내지 않는다. 이 영역의 웹 구현은 호출마다 헤더를 붙인다. 멤버·프로젝트 경로가 같은 헤더로 응답이 바뀌는지는 확인하지 않았다.

## 경로와 쿼리

| 메서드 | 웹 경로 | 쿼리·요청 본문 | 실측 결과 |
| --- | --- | --- | --- |
| getCalendars | GET `/v2/wapi/calendars` | `size=99999` | `result.contents` 와 `totalCount`. `size=2` 로 `page=0`/`1` 이 겹치지 않는다. `listed=true` 를 주면 목록 화면에 올린 캘린더만 온다(40 개, 없으면 61 개). 공식 API 는 이 필터가 없으므로 주지 않고 `me.listed` 를 그대로 둔다 |
| getCalendarEvents | GET `/v2/wapi/calendars/*/schedules` | `timeMin`, `timeMax` | `result.contents` 와 `references.calendarMap`. `calendars`·`category` 를 주지 않으면 접근 가능한 캘린더 전체의 `general` 일정만 온다. `category=post`, `milestone` 은 업무·단계가 따로 온다. `size`·`page` 는 무시된다 |
| getCalendarEvent | GET `/v2/wapi/calendars/{calendarId}/schedules/{eventId}` | 없음 | `result.content` 와 `references`. 반복 일정의 회차 id(`<id>-<날짜T시각Z>`)도 그대로 받는다. `calendarId` 자리에 `*` 는 서버 오류다 |
| createCalendarEvent | POST `/v2/wapi/schedules` | 원소 하나인 배열(아래 본문) | `result: [{id, masterScheduleId}]` |
| updateCalendarEvent | PUT `/v2/wapi/calendars/{calendarId}/schedules/{eventId}` | 바꿀 필드만 담은 객체 | `result: {content}`. 제목만 보내도 다른 필드(위치·본문·알림·공개 범위)는 그대로다 |
| deleteCalendarEvent | DELETE `/v2/wapi/calendars/{calendarId}/schedules/{eventId}` | 쿼리 `deleteType=this\|wholeFromThis\|whole` | `result: null`. 반복 일정의 회차 id 에 `this` 는 그 회차만, `wholeFromThis` 는 그 회차부터, `whole` 은 전체를 지운다. `deleteType` 이 없으면 회차 id 로 불러도 전체가 지워진다. 본문에 `deleteType` 을 넣는 방식은 듣지 않는다 |
| fetchBusyHours | (대응 경로 없음) | | 아래 「소속 조회」 |

생성 본문(원소 하나). 실측으로 통과한 꼴이다.

```json
[{
  "calendarId": "<calendarId>",
  "resourceId": null,
  "category": "general",
  "subject": "...",
  "body": { "mimeType": "text/x-markdown", "content": "..." },
  "location": "",
  "wholeDayFlag": false,
  "startedAt": "2026-11-20T10:00:00+09:00",
  "endedAt": "2026-11-20T10:30:00+09:00",
  "users": { "to": [], "cc": [] },
  "personalSettings": { "alarms": [{ "action": "app", "trigger": "TRIGGER:-PT10M", "option": null }], "busy": true, "class": "public", "travelTime": null },
  "replyFlag": false,
  "recurrenceType": "none",
  "recurrenceRule": null,
  "fileIdList": [],
  "conferencing": null
}]
```

- 종일 일정은 `startedAt`·`endedAt` 을 `2026-11-21+09:00` 으로도, `2026-11-21T00:00:00+09:00` 으로도 받는다. 읽을 때는 항상 `2026-11-21+09:00` 꼴이다. 공식 문서와 같다.
- 반복 일정은 `recurrenceType: "unmodified"` 와 `recurrenceRule`(`frequency`, `interval`, `startedAt`, `endedAt`, `until`, `byday`, `bymonthday`, `bymonth`, `timezoneName`)을 보낸다. 주 단위 반복(`weekly`, `byday`)과 종료일(`until`)을 확인했다. 반복 일정은 회차마다 `<id>-<날짜T시각Z>` 형태의 `id` 로 목록에 나온다.
- 수정은 부분 수정이 된다. 공식 문서와 달리 `users`·`personalSettings`·`recurrenceRule` 이 통째로 바뀌는지는 확인하지 않았다. 기존 CLI 가 이 객체들을 완성해서 보내므로 같은 결과가 된다.
- 알림(`personalSettings.alarms`)과 `class: "private"` 는 만든 뒤 읽어 확인했다.

HTTP 200 이어도 `header.isSuccessful` 이 `false` 인 오류가 있다. 웹 HTTP 층이 `EXIT_API_ERROR` 로 바꾼다.

| 상황 | 응답 |
| --- | --- |
| 기간이 50일을 넘음 | 200, `resultCode -200430`, `USER_INVALID_EXCEED_MAXIMUM_PERIOD`. 50일째 23:59:59 까지 통과하고 51일째 00:00 부터 막힌다. 공개 API 와 같은 한도다 |
| 없는 일정 id | 200, `resultCode -100201` |
| `timeMin` 이 날짜만(`2026-09-20`) | 400, 본문 없음 |
| `timeMin` 만 줌 | 통과한다. 부르는 쪽은 항상 둘 다 채운다 |

## 공식 응답 필드와 변환

| 메서드 | 공식 result 필드 | 웹과 다른 점 |
| --- | --- | --- |
| getCalendars | id, name, type, createdAt, ownerOrganizationMemberId, projectId, me(default, color, listed, checked, role, order), totalCount | `contents` 를 꺼내고 `totalCount` 를 위로 올린다. `me` 의 `published`·`notification` 등과 항목의 `tenantId`·`ctag`·`syncToken` 은 내지 않는다. `type` 이 `subscription` 이면 뺀다(공식 목록은 구독 캘린더를 주지 않는다) |
| getCalendarEvents | id, masterScheduleId, calendar(id, name), recurrenceId, startedAt, endedAt, location, subject, createdAt, updatedAt, category, wholeDayFlag, tenant(id), uid, recurrenceType, conferencing, users({}), me(type, member, status, userType) | `calendar.name` 은 `references.calendarMap` 으로 채운다. `recurrenceId` 의 빈 문자열은 `null` 로 바꾼다. `users` 는 공식 목록과 같이 빈 객체다. `me` 는 웹 `users.me` 의 `member.status`·`member.userType` 을 항목 위로 올려 만든다. `tenant.id` 는 `tenantId` 에서 얻는다. 웹에 없는 `conferencing` 이 `null` 이면 키를 뺀다. 업무·단계는 `category` 를 주지 않아 오지 않는다 |
| getCalendarEvent | 위 필드 + body(mimeType, content), users(from, to, cc), recurrenceRule, files | `content` 를 꺼낸다. `body.emptyContent` 는 뺀다. `users.from/to/cc` 항목은 `{type, member(organizationMemberId, name, emailAddress), status}` 로 바꾼다(웹은 `status` 가 `member` 안에 있다). `recurrenceRule` 은 `startedAt`·`endedAt` 을 빼고 나머지(`count`, `bysetpos`, `wkst` 포함)를 그대로 낸다. `files` 는 웹 응답에 정보가 없어 키를 뺀다 |
| createCalendarEvent | id | `result` 배열의 첫 항목 `id` 만 `{id}` 로 낸다 |
| updateCalendarEvent | null | `result: {content}` 를 `null` 로 바꾼다 |
| deleteCalendarEvent | null | 그대로 |

공식 API 로 같은 일정을 읽은 값과의 비교는 API 가 복구된 뒤의 후속 확인이다(스펙 DECISION26).

미실측: 참석자(`users.to`·`users.cc`)를 넣은 쓰기. 실측 장소 규칙이 참석자를 금지해 확인하지 못했다. 그래서 웹 방식에서는 `event create`·`event edit` 의 `--to`·`--cc` 를 지원하지 않는다(REQ8). `emailUser` 형 참석자의 읽기 모양도 미실측이다.

## 소속 조회(fetchBusyHours)

공식 `POST /calendar/v1/fetch-busy-hours` 는 `member get --with-org` 이 멤버의 소속 회사·부서·직책을 얻으려고 빌려 쓴다([ADR-079](../../adr/079-member-get-with-org.md)). 바쁨 시간 자체는 쓰지 않는다.
웹의 `POST /v2/wapi/freebusy/fetch` 는 `requestType` 쿼리 값과 요청 본문이 공식과 다르다(웹 화면은 `organizationMemberIdList`·`timeMin`·`timeMax`·`responseType` 을 보낸다). `requestType` 값을 알아내지 못해(`all`, `day` 는 404) 응답을 실측하지 못했다.
웹 응답의 멤버 참조(`references.organizationMemberMap`)에는 `department`, `position`, `corporate`, `defaultOrganizationId` 가 문자열·id 로 있다. 부서 id 는 없다. 이 값으로 소속을 채울 수 있는지는 미실측이다.
그래서 `member get --with-org` 는 웹 방식에서 지원하지 않는 것으로 둔다. 실측 뒤 지원하려면 member 영역의 지원 목록(`src/commands/web-support/member.ts`)을 한 줄 고쳐야 한다.
