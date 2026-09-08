## ADR-051: 응답 JSON 의 큰 정수를 문자열로 보존한다

**결정**: `ky.create` 에 `parseJson` 을 주어 모든 응답을 공통 파서로 읽는다.
그 파서는 JavaScript Number 로 담으면 값이 달라지는 정수 리터럴만 문자열로 바꾼다.
판정과 변환은 `src/api/json-large-integer.ts` 하나가 소유한다.

**맥락**: Dooray 의 식별자는 19자리 정수다.
JavaScript 의 `Number.MAX_SAFE_INTEGER` 는 16자리인 9007199254740991 이므로,
19자리 값을 `JSON.parse` 가 Number 로 읽으면 뒷자리가 달라진다.

대부분의 endpoint 는 식별자를 따옴표로 감싼 문자열로 준다.
그래서 이 문제가 오래 드러나지 않았다.

`messenger/v1/channels/direct-send` 응답만 따옴표 없는 숫자로 준다. 실측 결과는 아래와 같다.

| endpoint | 응답의 `id` 표기 | 정밀도 손실 |
| --- | --- | --- |
| `messenger/v1/channels/direct-send` | 숫자 | 있다 |
| `messenger/v1/channels/{id}/logs` | 문자열 | 없다 |
| `messenger/v1/channels/{id}/threads/create-and-send` | 문자열 | 없다 |

`dooray messenger send` 로 실제 발송한 뒤 값을 대조해 확인했다.

| 출처 | log-id |
| --- | --- |
| CLI 가 출력한 값 | 1234567890123456800 |
| 메신저 실시간 채널이 알려준 실제 값 | 1234567890123456789 |

`src/api/types.ts` 는 `MessengerSendResult.id` 를 `string` 으로 선언한다.
TypeScript 의 타입은 런타임 값을 바꾸지 않으므로 이 선언이 손실을 막지 못했다.

**적용 범위**: 특정 endpoint 가 아니라 모든 응답이다.

숫자로 주는 곳이 지금은 하나뿐이지만, 어느 endpoint 가 그렇게 주는지는 호출해 보기 전에는 알 수 없다.
`direct-send` 도 공식 문서가 `{id}` 하나만 준다고 적었으나 실제로는
`channelId`, `senderId`, `sentAt`, `seq`, `text` 를 함께 주고 그 식별자들도 모두 숫자였다.
문서로 범위를 좁힐 근거가 없다.

**손실이 나는 값만 바꾼다**: 자릿수로 자르지 않고 값으로 판정한다.
정수 리터럴을 Number 로 읽고 다시 문자열로 만들어 원본과 다를 때만 문자열로 감싼다.

이 판정에서 바뀌는 값은 원래 이미 손상되던 값뿐이다.
`sentAt` 같은 13자리 타임스탬프와 `seq` 와 `totalCount` 는 안전 범위 안이라 Number 로 남는다.

**대안 기각**:

- **메신저 발송 응답만 감싼다** — 지금 드러난 곳만 막는다.
  다음에 숫자로 주는 endpoint 를 구현하면 같은 손실이 되풀이되고, 그때도 실제 값과 대조하기 전에는 드러나지 않는다.
- **`json-bigint` 같은 패키지를 넣는다** — 파서 본체가 서른 줄 안쪽이라 의존을 늘릴 만큼이 아니다.
  그 패키지들은 손실 여부와 무관하게 BigInt 를 만들어, 안전 범위의 숫자까지 타입이 달라진다.
- **`JSON.parse` 의 reviver 로 고친다** — reviver 는 이미 Number 로 바뀐 값을 받는다.
  그 시점에는 원본 자릿수가 남아 있지 않아 되돌릴 수 없다.
- **호출부마다 `.text()` 로 받아 따로 파싱한다** — 같은 처리가 메서드 수만큼 흩어진다.
  `ky.create` 의 `parseJson` 은 인스턴스에 한 번만 주면 `.json()` 을 쓰는 모든 호출에 적용된다.

**감당할 것**: 어떤 필드를 `number` 로 선언해 두었는데 그 값이 안전 범위를 넘으면 런타임 타입이 `string` 이 된다.
그런 필드는 이 변경 전에도 잘못된 값을 담고 있었으므로 잃는 것은 없다.
다만 그 값을 산술에 쓰는 코드가 있으면 동작이 달라지므로, 적용과 함께 `number` 선언을 훑어 확인한다.
