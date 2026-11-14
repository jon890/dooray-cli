# messenger 웹 경로 실측

2026-11-14 실측했다. 공통 규칙과 공식 문서는 [색인](../web-endpoints.md)에 있다.
읽기와 쓰기를 실측했다. 쓰기는 내 「나와의 대화방」 에서만 했고 `[cli-web-probe]` 메시지는 모두 지웠다(남은 것 0건). 다른 사람의 대화방에 보내는 것은 같은 요청이지만 실측 장소 규칙상 확인하지 못했다.

메신저 웹 경로는 `/messenger/v1/api/...`, `/messenger/v3/api/...` 다. 다른 영역의 `/v2/wapi/...` 와 달리 `Dooray-Api-Version` 헤더를 보내지 않는다. 응답은 `{header, result: {content: …}}` 꼴이다.
웹 화면은 실시간 연결(WebSocket `/messenger/v5/ws/...`)도 쓴다. 이 CLI 는 쓰지 않는다.

## 경로와 쿼리

| 메서드 | 웹 경로 | 쿼리 | 실측 결과 |
| --- | --- | --- | --- |
| getMessengerChannels | GET `/messenger/v3/api/members/me/favorites` | `responseType=all`, `flags=system,normal,archived` | `result.content.channels[]` 에 내가 속한 방이 모두 온다(실측 계정 157개). `flags=normal` 만 주면 보관·시스템 방이 빠진다(154개). 쿼리가 없으면 155개다. 공식 목록은 보관·시스템 방도 주므로 세 값을 모두 보낸다 |
| getChannelLogs | GET `/messenger/v1/api/channel/{channelId}/logs` | `limit`, `setLastChannel=false` | `result.content` 에 `channelId`, `logs[]`, `hasPrev`, `isFirst`. 오래된 것이 앞이다(공식은 최신이 앞). `limit` 은 1000 까지 받고 1001 은 1000 건으로 잘린다. 화면은 `setLastChannel=true` 를 보내 「마지막에 연 방」 을 바꾼다. CLI 는 `false` 로 둔다 |
| sendChannelMessage | POST `/messenger/v1/api/channelLogs/{channelId}` | 본문 `{text, token}`. `token` 은 클라이언트가 만드는 UUID 다 | 결과 `result.content{id, channelId, senderId, seq, sentAt, text, …}`. SESSION 만으로 성공. 같은 token 을 두 번 보내도 서로 다른 메시지가 생겨 멱등이 아니다 |
| sendDirectMessage | (대응 경로 없음) | | 웹에는 상대 id 로 보내는 경로가 없다. 대화방 목록에서 나와의 대화방(`type: me`)이나 이미 있는 1:1 방(`direct`)을 찾아 위 경로로 보낸다. 나와의 대화방만 실측했다 |
| createChannelThread, createLogThread | POST `/messenger/v1/api/thread-channels` 뒤 `channelLogs/{threadChannelId}` | 본문 `{parentChannelId, parentChannelLogId, capacity: 1, type: "thread", members: [내 id], isPublic: false}` | 결과 `result.content.channelId` 가 스레드 채널이다. 그 채널에 `channelLogs` 로 보내면 스레드 글이 된다. 내 id 는 `GET /messenger/v1/api/members/me?v=0.2.0` 의 `content.id` 이고 메시지의 `senderId` 와 같다. 이미 스레드가 있는 로그에 다시 만들면 HTTP 200 에 `resultCode -300101`(`CHANNEL_ALREADY_EXISTS_ERROR`)이라, 부모 대화방 로그의 `thread.channelId` 에서 기존 채널을 찾아 쓴다 |
| downloadMessengerFile | GET `/messenger/v2/api/channel/{channelId}/file/{fileId}` | 없음 | SESSION 만으로 HTTP 200 에 `content-disposition: attachment` 와 본문이 바로 온다. 리다이렉트가 없다. 틀린 파일 id 는 HTTP 200 에 본문과 `content-disposition` 이 없다 |
| (메시지 삭제) | DELETE `/messenger/v1/api/channels/{channelId}/logs/{logId}` | 없음 | CLI 가 쓰지 않는다. 실측 메시지를 지우는 데만 썼다. `channelLogs`·`channel/…/logs` 경로로는 403 이다 |

대화방 목록은 `me`·`direct`·`private`·`bot` 네 종류가 왔다. 화면은 `me` 방(나와의 대화) 하나를 갖는다.

## 공식 응답 필드와 변환

### 대화방 목록

공식 필드: id, title, organization(id), type, users(participants), me(type, member, role), capacity, status, createdAt, updatedAt, displayed, role, archivedAt, 최상위 totalCount.

| 웹(`channels[]`) | 공식 | 변환 |
| --- | --- | --- |
| `channelId` | `id` | 그대로(문자열) |
| `title` | `title` | 그대로 |
| `orgId` | `organization.id` | 객체로 감싼다 |
| `type` | `type` | `direct`·`private`·`me`·`bot` 그대로 |
| `members[]`(id 배열) | `users.participants[]` | `{type: "member", member: {organizationMemberId}}` 로 바꾼다 |
| `memberId`, `role` | `me`, `role` | `me: {type: "member", member: {organizationMemberId: memberId}, role}`. `role` 은 웹 값(`creator`, `member`)이다. 공식 `admin` 은 `management.adminIds` 로 판정할 수 있으나 확인하지 못했다 |
| `capacity` | `capacity` | 그대로 |
| `flag` | `status` | `normal`·`system`·`archived` 문자열. 숫자 `status`(전부 `2`)는 쓰지 않는다. `deleted` 는 이 계정에서 오지 않았다 |
| `createdAt`, `updatedAt` | 같은 이름 | 웹은 epoch 밀리초 숫자다. `+09:00` 오프셋을 단 ISO 8601 로 바꾼다(공식 예시와 같다) |
| `displayed` | `displayed` | 그대로 |
| (없음) | `archivedAt` | 웹에 보관 시각이 없어 키를 만들지 않는다 |
| (개수) | `totalCount` | 배열 길이 |

웹에만 있는 `scope`, `seq`, `starred`, `readSeq`, `unreadCount`, `preferences`, `management`, `image` 등은 내지 않는다.
제목이 빈 방(`direct` 와 일부 `private`)은 공식과 같이 빈 문자열이다.

### 메시지 목록

공식 문서에는 이 경로(`GET /messenger/v1/channels/{id}/logs`)가 없다. 기준은 [ADR-061](../adr/061-messenger-logs-read.md)·[ADR-072](../adr/072-messenger-file-download.md) 가 적은 공개 API 응답(`MessengerLog`)이다.

| 웹(`logs[]`) | 공개 API | 변환 |
| --- | --- | --- |
| `id`, `seq` | `id`, `seq` | 그대로 |
| `senderId` | `sender` | `{type: "member", member: {organizationMemberId: senderId}}` |
| `sentAt` | `sentAt` | epoch 밀리초를 `+09:00` ISO 8601 로 |
| `text` | `text` | 그대로 |
| `type`(숫자 코드) | `type`(`FILE`·`REPLY` 등 문자열) | 확인한 대응만 바꾼다: `4`(`file` 객체가 있다)→`FILE`, `10`(`originalLogId` 가 있다)→`REPLY`. 나머지 코드(`0`·`1`·`2`·`6`·`9`)는 대응을 확인하지 못해 `type` 키를 만들지 않는다 |
| `file{id, title, fileName, fileSize, mimeType}` | `file` | 이 다섯 필드만 낸다. 썸네일·DRM 등은 뺀다 |
| `thread{channelId, totalCount, lastUpdatedAt}` | `thread` | 같은 이름과 모양이다. `totalCount` 는 문자열이다 |
| `hasPrev` | 최상위 `hasMore` | 그대로 |

- 순서는 뒤집어 최신이 앞이 되게 한다. `getChannelLogs` 의 호출자(`messenger logs`)가 다시 뒤집어 보여 준다.
- 웹 메시지에는 `attachments`(링크 미리보기, 봇 카드), `reactions`, `customName`, `format` 이 붙는다. 공개 API 필드가 아니라 내지 않는다.

공개 API 와 같은 방의 같은 구간을 비교하는 것은 API 복구 뒤 후속 확인이다(스펙 DECISION26).

## 미실측

- 다른 사람의 대화방과 그 대화방의 스레드에 보내는 것. 같은 요청이지만 실측 장소 규칙상 확인하지 못했다. 스레드 `members`·`isPublic` 값은 나와의 대화방 기준이다.
- 대화방이 없는 상대에게 처음 보내는 경로. 웹에서 대화방을 만드는 요청을 확인하지 않았고, CLI 는 요청 전에 종료 코드 3 으로 끝낸다.
- `type` 숫자 코드 `0`·`1`·`2`·`6`·`9` 의 문자열 대응.
