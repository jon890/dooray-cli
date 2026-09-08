# Phase 02. 파서를 API 클라이언트 전체에 꽂고 회귀를 확인한다

**Execution profile**: standard

## 목표

phase 01 이 만든 파서를 `ky.create` 의 `parseJson` 으로 준다.
그러면 `.json()` 을 쓰는 모든 응답이 그 파서를 거친다.

그리고 `number` 로 선언된 필드 중 이 변경으로 런타임 타입이 달라지는 것이 있는지 확인한다.

**범위 외**: 새 endpoint 를 만들지 않는다. 메신저 명령의 동작이나 옵션을 바꾸지 않는다.
`messenger thread-send` 는 plan066 이 맡는다.

## 컨텍스트

**근거 문서**: `docs/adr/051-json-large-integer-precision.md`.

`ky` 는 2.0.2 이고 `parseJson` 옵션을 지원한다.
`node_modules/ky/distribution/types/options.d.ts` 의 68행이 그 시그니처를 정의한다.

인스턴스는 `src/api/client.ts:158` 의 `ky.create` 하나뿐이다.
거기에 옵션 하나를 더하면 이 클라이언트를 거치는 모든 호출에 적용된다.

**바뀌는 값은 원래 이미 손상되던 값뿐이다.**
파서가 값으로 판정하므로, 안전 범위 안의 숫자는 이 변경 전후가 같다.

**확인해야 하는 것은 산술이다.** 어떤 필드를 `number` 로 선언해 두고 그 값이 안전 범위를 넘으면
이제 런타임에 `string` 이 온다. 그 값을 더하거나 비교하는 코드가 있으면 동작이 달라진다.
그런 필드는 이 변경 전에도 틀린 값을 담고 있었으므로 되돌리는 것이 아니라 드러내는 것이다.

## 의도 메모

- 호출부를 하나씩 고치지 않는다. 그러면 같은 처리가 메서드 수만큼 흩어지고 새 메서드가 그것을 빠뜨린다.
- 이 변경은 사용자 표면에 새 옵션을 만들지 않는다. `dooray messenger send` 가 옳은 log-id 를 내게 되는 것이 결과다.

## 작업 항목

### 1. `src/api/client.ts` 의 `ky.create` 에 `parseJson` 을 준다

`src/api/client.ts:158` 이 그 자리다.
phase 01 의 `parseJsonPreservingLargeIntegers` 를 import 해서 넘긴다.

`prefix` 와 `headers` 와 `retry` 와 `hooks` 는 그대로 둔다.

왜 여기에 두는지 한 줄 주석으로 남긴다. 이유는 ADR-051 을 가리키면 된다.
이 저장소의 다른 옵션들이 그 형태로 주석을 달고 있다.

### 2. `number` 선언을 훑어 산술에 쓰이는 곳이 있는지 본다

`src/api/types.ts` 에서 `: number` 로 선언된 필드를 모은다.

```bash
# cwd: <repo root>
grep -n ": number" src/api/types.ts
```

각각에 대해 판정한다.

- **19자리 식별자가 올 수 있는 필드인가.** 이름에 `Id` 가 붙거나 문서가 식별자라고 적은 것이다.
- 그런 필드가 있으면 그 값을 쓰는 코드를 찾아, 산술이나 크기 비교를 하는지 본다

실측으로 알고 있는 것은 이렇다.
`sentAt` 은 13자리 타임스탬프, `seq` 와 `totalCount` 와 `unreadCount` 는 작은 수라 모두 안전 범위 안이다.

**산술에 쓰이는 필드를 찾으면 고치지 않고 보고한다.**
그 필드는 이 변경 전에도 틀린 값이었으므로, 어떻게 다룰지는 별도 판단이다.

### 3. `MessengerSendResult` 의 주석을 실측에 맞춘다

`src/api/types.ts:638` 의 주석이 「direct-send 응답은 `{ id }` 만」 이라고 적는다.
실측 결과는 다르다. `channelId` 와 `senderId` 와 `sentAt` 과 `seq` 와 `text` 를 함께 준다.

주석을 실측에 맞게 고친다. 근거는 ADR-051 의 표다.

타입 자체는 넓히지 않는다. 이 저장소는 쓰는 필드만 선언하는 방식을 지켜 왔고,
지금 쓰는 것은 `id` 와 `channelId` 뿐이다.

### 4. 실제 발송으로 log-id 가 맞는지 확인한다

이 변경이 실제로 효과가 있는지는 서버 응답으로만 확인된다.

`dooray messenger send --to <본인 이메일> --body "..." --json` 을 실행하고,
출력된 `id` 의 자릿수가 19자리이며 끝자리가 `00` 으로 끝나지 않는지 본다.

정밀도를 잃은 값은 뒷자리가 0 으로 바뀐다. 실측한 손실 예시가 아래다.

```
실제 값   1234567890123456789
손실된 값 1234567890123456800
```

**이 확인은 실제 메시지를 보낸다.** 본인에게 보내면 다른 사람에게 알림이 가지 않는다.
설정이 없어 실행할 수 없으면 이 항목을 건너뛰고 그 사실을 보고한다.
`pnpm test` 가 통과 판정을 대신한다.

### 5. `docs/code-architecture.md` 의 api 절에 한 줄 넣는다

`src/api/` 를 설명하는 자리에 `json-large-integer.ts` 를 더한다.
무엇을 하는 파일인지 한 줄과 ADR-051 역참조를 담는다.

같은 절의 다른 항목들이 쓰는 형식을 그대로 따른다.

### 6. `src/api/client.test.ts` 를 만들어 연결을 검증한다

**이 phase 의 목표는 파서를 `ky` 인스턴스에 연결하는 것이므로, 그 연결 자체를 자동으로 검증한다.**
`grep` 은 문자열이 있는지만 보고 `pnpm test` 의 기존 테스트는 큰 정수를 다루지 않아,
둘 다 연결이 실제로 동작하는지 판정하지 못한다.

`vitest` 를 쓴다. `vi.stubGlobal("fetch", ...)` 로 응답을 흉내 낸다.
`ky` 는 전역 `fetch` 를 쓰므로 서버 없이 `DoorayApiClient` 를 통째로 거칠 수 있다.

담을 것은 둘이다.

| 확인할 것 | 흉내 낼 응답 본문 | 기대 |
| --- | --- | --- |
| 19자리 식별자가 문자열로 온다 | `{"header":{"resultCode":0,"resultMessage":"","isSuccessful":true},"result":{"id":1234567890123456789,"channelId":2222333344445555666,"sentAt":1788834599820,"seq":259}}` | `result.id` 가 문자열 `"1234567890123456789"`, `result.channelId` 가 문자열 `"2222333344445555666"` |
| 안전 범위 값은 숫자로 남는다 | 위와 같은 응답 | `result.sentAt` 과 `result.seq` 가 숫자 |

`client.sendDirectMessage("<memberId>", "메시지")` 로 호출한다.
`DoorayApiClient` 의 생성자는 `(apiKey, baseUrl)` 을 받으므로 가짜 값을 준다.

`afterEach` 에서 `vi.unstubAllGlobals()` 로 전역을 되돌린다.
되돌리지 않으면 같은 파일의 다른 테스트와 뒤 파일이 흉내 낸 `fetch` 를 그대로 쓴다.

**`parseJson` 을 떼면 이 테스트가 실패해야 한다.** 그것이 이 항목의 통과 조건이다.

## 검증

```bash
# cwd: <repo root>
pnpm tsc --noEmit
pnpm run build
pnpm test
```

셋 다 통과해야 한다. **이 phase 는 회귀를 보는 것이 목적이라 `pnpm test` 전체가 통과하는 것이 핵심 근거다.**
파서가 모든 응답을 거치므로, 기존 테스트 중 하나라도 깨지면 안전 범위 판정이 틀린 것이다.

변경이 실제로 들어갔는지 본다.

```bash
# cwd: <repo root>
grep -c "parseJson" src/api/client.ts                          # = 1
grep -c "json-large-integer" src/api/client.ts                 # >= 1
grep -c "json-large-integer" docs/code-architecture.md         # >= 1
grep -c "ADR-051" docs/code-architecture.md                    # >= 1
```

넷이 모두 맞아야 한다.

연결을 검증하는 테스트를 따로 돌려 확인한다.

```bash
# cwd: <repo root>
pnpm vitest run src/api/client.test.ts
```

주석이 실측에 맞게 고쳐졌는지 본다.

```bash
# cwd: <repo root>
grep -c "direct-send 응답은 { id } 만" src/api/types.ts        # = 0
```

0 이어야 한다. 실측과 어긋나는 서술이 남아 있지 않다는 근거다.

문서 검사를 통과시킨다.

```bash
# cwd: <repo root>
~/.claude/skills/korean-check/scripts/check.sh docs/code-architecture.md
node scripts/check-pii.mjs
```

둘 다 종료 코드 0 이어야 한다.

## Critical Files

| 파일 | 변경 |
|---|---|
| `src/api/client.ts` | 수정 — `ky.create` 에 `parseJson` 추가 |
| `src/api/types.ts` | 수정 — `MessengerSendResult` 주석을 실측에 맞춤 |
| `docs/code-architecture.md` | 수정 — api 절에 새 모듈 한 줄 |
| `src/api/client.test.ts` | 신규 — `parseJson` 연결 검증 |
