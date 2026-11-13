# messenger 웹 경로 실측

2026-11-14 실측했다. 공통 규칙과 공식 문서는 [색인](../web-endpoints.md)에 있다.
읽기(대화방 목록·메시지 목록)만 실측했다. 보내기·스레드·파일 받기는 아래 「미실측」 에 이유와 함께 적었다.

메신저 웹 경로는 `/messenger/v1/api/...`, `/messenger/v3/api/...` 다. 다른 영역의 `/v2/wapi/...` 와 달리 `Dooray-Api-Version` 헤더를 보내지 않는다. 응답은 `{header, result: {content: …}}` 꼴이다.
웹 화면은 실시간 연결(WebSocket `/messenger/v5/ws/...`)도 쓴다. 이 CLI 는 쓰지 않는다.

## 경로와 쿼리

| 메서드 | 웹 경로 | 쿼리 | 실측 결과 |
| --- | --- | --- | --- |
| getMessengerChannels | GET `/messenger/v3/api/members/me/favorites` | `responseType=all`, `flags=system,normal,archived` | `result.content.channels[]` 에 내가 속한 방이 모두 온다(실측 계정 157개). `flags=normal` 만 주면 보관·시스템 방이 빠진다(154개). 쿼리가 없으면 155개다. 공식 목록은 보관·시스템 방도 주므로 세 값을 모두 보낸다 |
| getChannelLogs | GET `/messenger/v1/api/channel/{channelId}/logs` | `limit`, `setLastChannel=false` | `result.content` 에 `channelId`, `logs[]`, `hasPrev`, `isFirst`. 오래된 것이 앞이다(공식은 최신이 앞). `limit` 은 1000 까지 받고 1001 은 1000 건으로 잘린다. 화면은 `setLastChannel=true` 를 보내 「마지막에 연 방」 을 바꾼다. CLI 는 `false` 로 둔다 |

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
| (확인 못 함) | `thread{channelId, totalCount, lastUpdatedAt}` | 스레드가 달린 메시지의 웹 필드는 만나지 못했다 |
| `hasPrev` | 최상위 `hasMore` | 그대로 |

- 순서는 뒤집어 최신이 앞이 되게 한다. `getChannelLogs` 의 호출자(`messenger logs`)가 다시 뒤집어 보여 준다.
- 웹 메시지에는 `attachments`(링크 미리보기, 봇 카드), `reactions`, `customName`, `format` 이 붙는다. 공개 API 필드가 아니라 내지 않는다.

공개 API 와 같은 방의 같은 구간을 비교하는 것은 API 복구 뒤 후속 확인이다(스펙 DECISION26).

## 미실측

- 보내기(`sendDirectMessage`, `sendChannelMessage`), 스레드 만들기(`createChannelThread`, `createLogThread`), 파일 받기(`downloadMessengerFile`)의 웹 경로. 웹 화면의 보내기는 실시간 연결을 거칠 가능성이 있어, 요청 경로를 찾지 못하면 REQ8 대로 지원하지 않는다고 적는다. 브라우저 권한 창이 떠 제어권이 사용자에게 넘어가면서 2026-11-14 1단계에서는 실측하지 못했다.
- 스레드가 달린 메시지의 웹 필드와 `thread` 변환.
- `type` 숫자 코드 `0`·`1`·`2`·`6`·`9` 의 문자열 대응.
