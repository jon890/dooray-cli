# Phase 01. `messenger thread-send` 를 만든다

**Execution profile**: standard

## 목표

대화방에 스레드를 여는 `dooray messenger thread-send` 를 추가한다.
`--log` 유무로 공식 endpoint 둘을 가른다.

**범위 외**: 이 phase 는 문서를 고치지 않는다. README 와 스킬 문서와 `docs/` 는 phase 02 다.
메시지 수정과 삭제와 답장 endpoint 는 이 plan 이 다루지 않는다.

## 컨텍스트

**근거 문서**: `docs/adr/052-messenger-thread-send.md`.

호출할 endpoint 는 둘이다.

| `--log` | endpoint | 요청 body |
| --- | --- | --- |
| 없음 | `POST messenger/v1/channels/{channel-id}/threads/create-and-send` | `{ text, threadText? }` |
| 있음 | `POST messenger/v1/channels/{channel-id}/logs/{log-id}/threads/create-and-send` | `{ text }` |

**응답 모양은 둘이 같다.** 실측한 것이 아래다.

```json
{"header":{"resultCode":0,"resultMessage":"","isSuccessful":true},"result":{"id":"1111222233334444555","channelId":"2222333344445555666"}}
```

`id` 는 log-id 이고 `channelId` 는 새로 만들어진 스레드 채널의 id 다.
요청에 넣은 대화방 id 와 다른 값이 온다.

**공식 문서가 말하는 `threadChannelId` 필드는 오지 않는다.**
문서의 `logs` 절이 `$.result.threadChannelId` 를 쓰라고 적지만 응답에 그 이름의 필드가 없다.
`channelId` 가 그 역할이며, 그 값으로 `POST channels/{id}/logs` 를 보내 스레드에 메시지가 붙는 것을 실측했다.
근거는 ADR-052 의 「실측으로 확인한 것」 절이다.

응답의 `id` 와 `channelId` 는 문자열로 온다. 이 endpoint 에는 정밀도 문제가 없다.

**재사용할 것**은 셋이다.

| 무엇 | 어디 | 쓰는 이유 |
| --- | --- | --- |
| `resolveMessengerChannel` | `src/resolvers/messenger-channel.ts` | `--channel` 이 channelId 나 대화방 이름을 받는다 |
| `readBodyInputOrNull` | `src/utils/body-input.ts` | `--body` 와 `--body-file` 과 `-` stdin 을 함께 처리한다 |
| `openInEditor` | `src/editor/index.ts` | 본문이 없으면 편집기를 연다 |

`src/commands/messenger/channel-send.ts` 가 이 셋을 모두 쓴다. 구조를 그대로 따른다.

## 의도 메모

- 명령을 둘로 나누지 않는 이유는 ADR-052 의 「대안 기각」 이 적는다. 옵션 대부분이 겹치기 때문이다.
- `--quiet` 가 `channelId` 를 내는 것은 다른 messenger 명령과 다르다. 근거도 그 ADR 이 적는다.
  스레드를 연 다음에 하는 일이 그 스레드에 메시지를 잇는 것이고, 그 호출에 필요한 값이 `channelId` 다.
- 옵션 조합 판정을 순수 함수로 빼서 테스트한다. 명령 본체는 네트워크를 타서 단위 테스트가 어렵다.

## 작업 항목

### 1. `src/api/types.ts` 에 요청 타입 둘을 넣는다

`ChannelLogRequest` 바로 아래에 둔다. 같은 Messenger 절이다.

- `ChannelThreadRequest` — `text: string` 과 `threadText?: string`
- `LogThreadRequest` — `text: string`

응답 타입은 새로 만들지 않는다. `MessengerSendResult` 가 `id` 와 `channelId?` 를 이미 담는다.
스레드 응답은 둘 다 항상 오지만, 그 타입을 좁히려고 새 타입을 만들면 같은 모양이 둘이 된다.

주석으로 `channelId` 가 스레드 응답에서는 스레드 채널 id 라는 것을 한 줄 남긴다.
이름만 보면 요청에 넣은 대화방 id 로 읽히기 때문이다.

### 2. `src/api/client.ts` 에 메서드 둘을 넣는다

기존 Messenger 절 안, `sendChannelMessage` 아래에 둔다.

```ts
async createChannelThread(
  channelId: string,
  text: string,
  threadText?: string,
): Promise<MessengerSendResponse>

async createLogThread(
  channelId: string,
  logId: string,
  text: string,
): Promise<MessengerSendResponse>
```

`sendChannelMessage` 와 같은 형태로 쓴다. `try` 로 감싸고 `toDoorayCliError` 로 던진다.

`threadText` 가 없으면 요청 body 에 그 키를 넣지 않는다. 빈 문자열을 보내면 빈 메시지가 스레드에 생긴다.

### 3. 옵션 조합 판정을 순수 함수로 만든다

`src/commands/messenger/thread-options.ts` 를 새로 만든다.

명령 본체는 네트워크와 편집기를 타서 단위 테스트가 어렵다.
갈리는 판정만 떼어 내면 테스트할 수 있다.

판정할 것은 둘이다.

- **`--log` 와 `--thread-body` 계열을 함께 주면** 경고할 대상이라고 알린다.
  `logs/{log-id}/threads/create-and-send` 는 `text` 만 받기 때문이다.
- **`--body-file -` 과 `--thread-body-file -` 을 함께 주면** 에러다.
  stdin 은 한 번만 읽을 수 있어 둘 다 받을 수 없다. `--body -` 와 `--thread-body -` 도 같다.

함수는 입력한 옵션을 받아 판정 결과를 돌려준다. 던지지 않고 돌려준다.
그래야 호출부가 경고와 에러를 각각 어떻게 낼지 정할 수 있고 테스트가 쉬워진다.

### 4. `src/commands/messenger/thread-options.test.ts` 를 만든다

담을 것은 아래 여섯이다.

| 확인할 것 | 입력 | 기대 |
| --- | --- | --- |
| 기본 조합 | `--channel` 과 `--body` | 경고도 에러도 없다 |
| 스레드 본문 동반 | `--channel` 과 `--body` 와 `--thread-body` | 경고도 에러도 없다 |
| log 분기 | `--channel` 과 `--log` 와 `--body` | 경고도 에러도 없다 |
| log 와 스레드 본문 충돌 | `--log` 와 `--thread-body` | 경고 대상이다 |
| log 와 스레드 본문 파일 충돌 | `--log` 와 `--thread-body-file` | 경고 대상이다 |
| stdin 중복 | `--body -` 와 `--thread-body -` | 에러다 |

`--body-file -` 과 `--thread-body-file -` 조합도 한 건 넣는다.

### 5. `src/commands/messenger/thread-send.ts` 를 만든다

`channel-send.ts` 를 구조의 본으로 삼는다.

옵션은 이렇다.

| 옵션 | 설명 |
| --- | --- |
| `--channel <channelId\|이름>` | 대화방. 필수 |
| `--log <log-id>` | 이 메시지에 스레드를 연다. 생략하면 새 메시지를 보내며 연다 |
| `--body <text>` | 대화방에 보낼 본문. `-` 는 stdin |
| `--body-file <path>` | 본문 파일. `-` 는 stdin |
| `--thread-body <text>` | 스레드 첫 메시지. `-` 는 stdin |
| `--thread-body-file <path>` | 스레드 첫 메시지 파일. `-` 는 stdin |

실행 순서는 이렇다.

1. `--channel` 이 없으면 `EXIT_PARAM_ERROR` 로 에러를 낸다. `channel-send.ts` 와 같은 문구 형식을 쓴다
2. 항목 3 의 판정 함수를 부른다. 에러면 `EXIT_PARAM_ERROR`, 경고면 stderr 에 한 줄 낸다
3. 설정을 읽고 클라이언트를 만든다
4. `resolveMessengerChannel` 로 channelId 를 얻는다
5. 본문을 읽는다. `--body` 와 `--body-file` 이 둘 다 없으면 `openInEditor` 를 연다
6. 본문이 비어 있으면 `EXIT_PARAM_ERROR` 로 에러를 낸다
7. 스레드 첫 메시지를 읽는다. 없으면 `undefined` 로 둔다. 여기서는 편집기를 열지 않는다
8. `--log` 유무로 `createLogThread` 나 `createChannelThread` 를 부른다
9. 결과를 낸다

**스레드 첫 메시지가 없을 때 편집기를 열지 않는다.** 본문과 달리 이 값은 선택이다.
편집기를 열면 생략할 방법이 사라진다.

출력은 세 형식이다.

- `--json` — `res.result` 를 그대로 낸다
- `--quiet` — `res.result.channelId` 를 낸다. 다른 messenger 명령과 다른 점이고 근거는 ADR-052 다
- 기본 — 사람이 읽는 한 줄. log-id 와 스레드 채널 id 를 함께 보여준다.
  스레드에 메시지를 이으려면 뒤의 값이 필요하므로 둘을 구분해 적는다

스피너는 `channel-send.ts` 와 같이 쓴다. 실패하면 `stopSpinner(false)` 후 다시 던진다.

### 6. `src/commands/messenger/index.ts` 에 등록한다

`messengerChannelSendCommand` 아래에 `addCommand` 한 줄을 더한다.

## 검증

```bash
# cwd: <repo root>
pnpm tsc --noEmit
pnpm run build
pnpm test
```

셋 다 통과해야 한다.

새 테스트만 골라 돌려 확인한다.

```bash
# cwd: <repo root>
pnpm vitest run src/commands/messenger/thread-options.test.ts
```

명령이 실제로 등록됐는지 본다.

```bash
# cwd: <repo root>
node dist/index.js messenger --help
```

출력에 `thread-send` 가 있어야 한다.

```bash
# cwd: <repo root>
node dist/index.js messenger thread-send --help
```

출력에 위 표의 옵션 여섯이 모두 있어야 한다.

`--channel` 없이 부르면 종료 코드 3 으로 끝나는지 본다.

```bash
# cwd: <repo root>
node dist/index.js messenger thread-send --body "x" ; echo "종료코드=$?"
```

`종료코드=3` 이어야 한다. `EXIT_PARAM_ERROR` 가 3 이다.

파일이 생겼는지 본다.

```bash
# cwd: <repo root>
ls src/commands/messenger/thread-send.ts src/commands/messenger/thread-options.ts src/commands/messenger/thread-options.test.ts
grep -c "threadSendCommand" src/commands/messenger/index.ts    # >= 1
grep -c "createChannelThread" src/api/client.ts                # >= 1
grep -c "createLogThread" src/api/client.ts                    # >= 1
```

**실제 발송으로 한 번 확인한다.** 응답 모양은 서버만 알려준다.

본인과의 대화방에 스레드를 열고, 나온 `channelId` 로 메시지를 이어 본다.

```bash
# cwd: <repo root>
CH=$(node dist/index.js messenger thread-send --channel <본인 대화방> --body "스레드 확인" --thread-body "첫 메시지" --quiet)
node dist/index.js messenger channel-send --channel "$CH" --body "이어 붙인 메시지"
```

둘 다 성공하고, 두 번째 메시지가 대화방 본문이 아니라 스레드 안에 붙어야 한다.

**이 확인은 실제 메시지를 보낸다.** 본인에게 보내면 다른 사람에게 알림이 가지 않는다.
설정이 없어 실행할 수 없으면 건너뛰고 그 사실을 보고한다.

개인 식별 정보를 확인한다.

```bash
# cwd: <repo root>
node scripts/check-pii.mjs
```

종료 코드 0 이어야 한다.

## Critical Files

| 파일 | 변경 |
|---|---|
| `src/api/types.ts` | 수정 — 요청 타입 둘 추가 |
| `src/api/client.ts` | 수정 — 메서드 둘 추가 |
| `src/commands/messenger/thread-options.ts` | 신규 |
| `src/commands/messenger/thread-options.test.ts` | 신규 |
| `src/commands/messenger/thread-send.ts` | 신규 |
| `src/commands/messenger/index.ts` | 수정 — 명령 등록 |
