# stream 웹 경로 실측

2026-11-14 실측했다. 공통 규칙과 공식 문서는 [색인](../web-endpoints.md)에 있다. 읽기만 했다.

웹 화면의 「스트림」 패널이 쓰는 `GET /v2/wapi/streams` 가 대응한다. 이 경로는 `services` 쿼리가 없으면 항상 빈 목록을 준다.
같은 이름의 `GET /wapi/common/v1/streams` 는 404 다.

패널을 여는 순간 화면이 `POST /v2/wapi/streams/read` 를 불러 항목을 읽음으로 바꾼다. 실측 중 패널을 한 번 열어 이 호출이 일어났다. CLI 는 이 경로를 부르지 않는다.

## 경로와 쿼리

| 메서드 | 웹 경로 | 쿼리 | 실측 결과 |
| --- | --- | --- | --- |
| getStreams | GET `/v2/wapi/streams` | `services=project,mail,calendar,drive,wiki,contacts,ai`(웹 화면이 보내는 값 그대로), `size`, `before`, `read` | `result.contents`, `result.totalCount`, `result.references` |

- `size` 는 1000 까지 받았다(공식은 200 까지). 한도는 CLI 가 정한 200 을 그대로 둔다.
- 다음 페이지는 `before=<직전 응답의 result.references.nextTimestamp>` 다. 웹 화면이 그렇게 부른다. 공식 `cursor` 에 해당한다. 항목의 `id` 를 `before` 로 넘기면 같은 페이지가 돌아온다.
- 응답에 `cursor` 필드는 없다. 끝은 빈 `contents` 로 안다.
- `read=false` 는 안 읽은 것만(4592), `read=true` 는 읽은 것만(342) 걸렀다. 전체는 4925 건이었다(최근 2주).
- `services` 를 하나씩 주면 `mail`→`mail`, `project`→`post`, `wiki`→`page`, `calendar`→`calendar`·`schedule` 항목이 왔다. `drive`·`contacts`·`ai` 는 이 계정에서 0 건이라 모양을 확인하지 못했다.
- 항목 순서가 `id` 내림차순이 아니다. 정렬 기준을 확인하지 못했다. 서버 순서를 그대로 둔다.
- `Dooray-Api-Version` 헤더 유무는 결과가 같았다.

## 웹 응답의 모양

웹은 항목을 「카드」 로 준다. 카드는 종류와 id 만 담고 내용은 `result.references` 의 맵에서 id 로 찾는다.

| 카드 `type` | 카드 안 | 내용을 찾는 곳(`references.…`) | 하위 항목 |
| --- | --- | --- | --- |
| `mail` | `mail.id` | `mailMap[id]` (`subject`, `folderId`, `folderName`, `mail.sentAt`, `users.from.emailUser`, `body`) | 없음 |
| `post` | `post.id`, `post.read` | `postMap[id]` (`projectId`, `users`, `subject`, `body`, `createdAt`, `updatedAt`) | `eventList[]` (`id`, `read`, `type`) 의 내용은 `eventMap[id]` (`postId`, `creator`, `body`, `createdAt`) |
| `page` | `page.id`, `page.read` | `pageMap[id]` (`wikiId`, `parentPageId`, `subject`, `body`, `create.dateTime`, `create.member`, `referrers`) | `eventList[]` 의 내용은 `pageEventMap`·`pageCommentMap` |
| `schedule` | `schedule.id`, `schedule.read` | `scheduleMap[id]` (캘린더 상세와 같은 모양) | `eventList[]` |
| `calendar` | `calendar.id`, `calendar.source`, `calendar.target`, `calendar.action`, `calendar.at` | (카드 안에 있음) | 없음 |

`eventList[].type` 은 `event`·`comment`·`null` 이 왔다. 이름을 담은 사람은 `references.organizationMemberMap` 에도 있다.

## 공식 응답 필드와 변환

공식 원소는 `{ type, <type>: {…} }` 이고 `post` 의 업무 댓글은 별도 `event` 원소, 위키 댓글은 별도 `pageComment` 원소다. 웹은 업무·위키 카드 하나에 하위 항목을 묶는다.

| 웹 | 공식 원소 | 변환 |
| --- | --- | --- |
| `mail` 카드 | `{type: "mail", mail: {id, folder{id, name}, sentAt, subject, users{from{type, emailUser{name, emailAddress}}}, body{mimeType, content}}}` | `mailMap` 에서 채운다. `folderId` 는 숫자라 문자열로 바꾼다 |
| `post` 카드 | `{type: "post", post: {read, id, projectId, users, subject, body, createdAt, updatedAt}}` | `postMap` 에서 채운다. `users` 항목은 `{type, member{organizationMemberId, name}}` 로 줄인다 |
| `post` 카드의 `eventList[]` | `{type: "event", event: {read, id, type, postId, creator, body}}` | 하위 항목마다 원소 하나를 더한다. 업무 카드 뒤에 둔다 |
| `page` 카드 | `{type: "page", page: {read, id, wikiId, parentPageId, subject, referrers, body, creator, createdAt}}` | `pageMap` 에서 채운다. `pageId` 를 `id` 로, `create.dateTime` 을 `createdAt` 으로, `create.member` 를 `creator` 로 옮긴다 |
| 위키 댓글 하위 항목 | `{type: "pageComment", pageComment: {read, id, pageId, body, creator, createdAt}}` | `pageCommentMap` 에서 채운다 |
| `schedule` 카드 | `{type: "schedule", schedule: {read, id, calendarId, users, startedAt, endedAt, wholeDayFlag, subject, recurrenceType, recurrenceRule}}` | `scheduleMap` 에서 채운다. `users` 항목은 상세 변환과 같다 |
| `references.nextTimestamp` | `cursor` | 최상위 `cursor` 로 옮긴다 |

웹에만 있어 낼 수 없는 것과 공식에만 있어 낼 수 없는 것:

- 웹의 `calendar` 카드(캘린더 공유 알림)와 `pageEventMap` 하위 항목(첨부 추가·삭제 같은 위키 활동)은 공식 원소 종류에 없어 뺀다. 뺀 개수는 stderr 로 알린다.
- 공식 원소 종류 `project`(프로젝트 멤버 변경)와 `fileEvent`(드라이브 파일)는 이 계정에서 웹 응답에 나오지 않았다. 나오면 모양을 모르니 같이 뺀다.
- 카드 하나가 원소 여러 개가 된다. 그래서 `size` 는 웹 카드 수이고 돌려주는 원소 수와 같지 않다. 공식도 응답 건수가 `size` 보다 적을 수 있다고 적고 있어 CLI 의 페이지 넘기기 규칙(빈 배열까지)은 그대로 쓴다.
- 업무 댓글 `event.type` 은 웹의 `eventMap[id].type`·`subtype` 값을 그대로 쓴다. 공식 값(`comment` 등)과의 대응은 API 복구 뒤 비교한다.

공식 API 와 같은 기간의 원소를 나란히 비교하는 것은 후속 확인이다(스펙 DECISION26).
