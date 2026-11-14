# Phase 03. messenger 명령을 웹 방식으로 돌게 한다

**Execution profile**: standard

## 목표

`messenger channels`·`logs` 가 웹 방식에서 공식 응답 모양으로 돈다. `send`·`channel-send`·`thread-send`·`file download` 는 웹 경로를 실측해 붙이고, 경로가 없으면 설명과 함께 막는다.

**범위 외**: 실시간 연결(WebSocket)을 쓰는 방식은 이 CLI 에 넣지 않는다.

## 컨텍스트

**요구사항**: REQ6, REQ7, REQ8

**근거 문서**: `docs/api/web-endpoints/messenger.md`

**전제**: PR1 머지 뒤 main 의 `MessengerClient`(`src/api/messenger/types.ts`), `WebContext`·`WebHttp`. 지시서의 쓰기 장소 규칙(나에게 보내는 대화에만 보낸다)을 지킨다.

## 작업 항목

### 1. 보내기·스레드·파일 받기의 웹 경로를 실측한다(완료 2026-11-14)

나와의 대화방에서 실측해 `docs/api/web-endpoints/messenger.md` 에 적었다. 보내기(`channelLogs`), 스레드 만들기(`thread-channels`), 파일 받기(`channel/{id}/file/{id}`), 삭제 경로가 모두 REST 였다. 다른 사람의 대화방에 보내는 것만 미실측이다.

### 2. 응답 고정 파일

`src/api/web/fixtures/messenger/responses.json` 에 가짜 대화방 목록(네 종류, `flag` 세 값, 숫자 시각)과 가짜 로그(텍스트, 파일, 답장)를 직접 쓴다. 실제 응답을 저장하지 않는다.

### 3. `src/api/messenger/web.ts` 의 `createMessengerWeb(context): MessengerClient`

- `getMessengerChannels`: `GET messenger/v3/api/members/me/favorites?responseType=all&flags=system,normal,archived`. 변환은 `messenger.md` 의 표대로 한다. 시각은 `+09:00` ISO 8601.
- `getChannelLogs`: `GET messenger/v1/api/channel/{channelId}/logs?limit=<n>&setLastChannel=false`(`apiPath` 로 인코딩). 최신이 앞이 되게 뒤집고 `hasPrev` 를 `hasMore` 로 올린다.
- 1번에서 경로를 찾은 메서드를 붙인다. 못 찾은 메서드는 `MessengerClient` 계약상 구현해야 하므로 `EXIT_PARAM_ERROR`(3)와 「웹 방식에서는 지원하지 않습니다. auth-mode 를 api-key 로 바꾸세요」 로 끝나는 구현을 둔다. 지원 목록에서 이미 막히지만 런타임에도 막는다.
- 첨부(파일 받기)는 설계 「웹 HTTP 층」 의 307 규칙을 따른다.

### 4. `src/api/messenger/web.test.ts`

가짜 `fetch` 로 경로·쿼리, 채널 변환(종류·`flag`→`status`·시각·참여자·`totalCount`), 로그 변환(순서·`sender`·`file`·`type` 대응·`hasMore`), 모르는 `type` 코드는 키가 없는 것, 응답 구조가 달라졌을 때의 `EXIT_API_ERROR` 를 확인한다.

### 5. 지원 목록과 배선

`src/commands/web-support/messenger.ts` 에 여섯 명령(`channels`, `logs`, `send`, `channel-send`, `thread-send`, `file download`)을 둔다. `src/api/web/index.ts` 의 `messenger` 한 줄과 `web-support.ts` 영역 파일 한 줄만 고친다. `src/resolvers/messenger-channel.ts`, `src/commands/messenger/**` 는 `createClient` 와 `MessengerClient` 를 쓴다.

### 6. 문서

`docs/guide/messenger.md` 에 「웹 방식에서 지원하지 않는 명령·옵션」 표를 더한다(지원하지 못한 명령과 이유, 웹 방식의 로그 `type` 키 차이).

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

## 변경 파일

| 파일 | 변경 |
| --- | --- |
| `src/api/messenger/web.ts`, `src/api/messenger/web.test.ts` | 신규 |
| `src/api/web/fixtures/messenger/responses.json` | 신규 |
| `src/commands/web-support/messenger.ts` | 신규 |
| `src/api/web/index.ts`, `src/commands/web-support.ts` | 한 줄씩 |
| `src/commands/messenger/**`, `src/resolvers/messenger-channel.ts` | `createClient` 와 영역 계약 타입 |
| `docs/guide/messenger.md`, `docs/api/web-endpoints/messenger.md` | 웹 방식 표, 실측 보완 |
