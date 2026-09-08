## ADR-052: 메신저 스레드 생성을 `thread-send` 한 명령으로 둔다

**결정**: `dooray messenger thread-send` 하나를 추가하고 `--log` 유무로 두 endpoint 를 가른다.

| `--log` | 호출하는 endpoint | 요청 body |
| --- | --- | --- |
| 없음 | `POST /messenger/v1/channels/{channel-id}/threads/create-and-send` | `{ text, threadText? }` |
| 있음 | `POST /messenger/v1/channels/{channel-id}/logs/{log-id}/threads/create-and-send` | `{ text }` |

**맥락**: 대화방에 진행 상황을 여러 번 보고하는 자동화가 본문에 메시지를 늘어놓으면 대화방을 읽기 어려워진다.
스레드로 묶으면 대화방에는 한 줄만 남고 나머지는 그 안에 쌓인다.

공식 API 는 스레드를 여는 방법을 둘로 나눠 둔다.
새 메시지를 보내면서 여는 것과, 이미 있는 메시지에 여는 것이다.
받는 인자가 대화방이라는 점과 응답 모양이 같아서, 명령을 나누면 옵션 대부분이 두 곳에 겹친다.

**실측으로 확인한 것**: 공식 문서의 서술이 스스로 어긋나 호출해서 확인했다.

문서는 `POST /channels/{channel-id}/logs` 절에서
「`threads/create-and-send` API 응답의 `$.result.threadChannelId` 값을 넣어 요청할 수 있습니다」 라고 적는다.
그런데 같은 문서의 `threads/create-and-send` 응답 예시에는 `threadChannelId` 가 없다.

실제 응답은 이렇다.

```json
{ "result": { "id": "1111222233334444555", "channelId": "2222333344445555666" } }
```

`threadChannelId` 라는 필드는 오지 않는다.
`channelId` 가 새로 만들어진 스레드 채널의 id 이고, 요청에 넣은 대화방 id 와 다른 값이다.
그 `channelId` 로 `POST /channels/{id}/logs` 를 보내 스레드에 메시지가 붙는 것을 확인했다.

근거 우선순위는 ADR-046 이 정한다. 다만 이번에는 공식 문서 안에서 두 서술이 어긋나므로
실측한 응답을 따르고 그 사실을 여기 남긴다.

**적용 범위 (설계 결정)**:

- **`--channel`** 은 `channel-send` 와 같다. channelId 이거나 대화방 이름이며 `resolveMessengerChannel` 을 그대로 쓴다.
- **본문**은 `--body` / `--body-file` 이고 둘 다 없으면 `$EDITOR` 가 열린다. 기존 messenger 명령과 같다.
- **스레드 첫 메시지**는 `--thread-body` / `--thread-body-file` 로 받는다.
  자동화가 긴 로그를 스레드에 넣는 경로가 있어 파일 입력을 함께 둔다. 생략하면 스레드만 열리고 첫 메시지는 없다.
- **`--log` 와 `--thread-body` 를 함께 주면** 경고를 내고 `--thread-body` 를 무시한다.
  `logs/{log-id}/threads/create-and-send` 는 `text` 만 받기 때문이다.
  전용 옵션을 무시하고 경고를 내는 것은 `CLAUDE.md` 의 공통 규약이 이미 정한 처리다.
- **`--quiet` 는 `channelId` 를 낸다.** 다른 messenger 명령은 `id` 를 내지만 여기서는 갈라 둔다.
  스레드를 연 다음에 하는 일은 그 스레드에 메시지를 잇는 것이고, 그 호출에 필요한 값이 `channelId` 다.
  `id` 를 내면 사용자가 `--json` 으로 다시 받아 `channelId` 를 꺼내야 한다.
- **`--json` 은 `res.result` 를 그대로 낸다.** 기존 messenger 명령과 같다.

**스레드에 메시지를 잇는 것은 새 명령을 두지 않는다**:
`dooray messenger channel-send --channel <스레드의 channelId>` 가 그대로 동작한다.
스레드 채널도 채널이라 `logs` endpoint 를 공유하기 때문이다. 사용법은 README 와 스킬 문서에 적는다.

**대안 기각**:

- **endpoint 마다 명령을 하나씩 둔다** — `--channel`, 본문 입력, 출력 세 형식이 두 명령에 그대로 겹친다.
  가르는 것은 대상이 대화방이냐 특정 메시지냐 하나뿐이라 옵션 하나가 그 역할을 한다.
- **`channel-send` 에 `--thread` 를 붙여 흡수한다** — 그 명령의 반환값은 log-id 하나인데
  스레드는 log-id 와 스레드 채널 id 둘을 낸다. 출력 규약이 갈려 같은 명령 안에서 두 모양이 된다.
- **`--quiet` 도 `id` 로 통일한다** — 형식은 맞지만 그 값으로 이어서 할 수 있는 일이 없다.
