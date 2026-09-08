# Phase 01. 큰 정수를 보존하는 JSON 파서를 만든다

**Execution profile**: standard

## 목표

`src/api/json-large-integer.ts` 를 새로 만든다.
JSON 텍스트를 파싱하되, JavaScript Number 로 담으면 값이 달라지는 정수 리터럴만 문자열로 바꿔 보존한다.

**범위 외**: 이 phase 는 `src/api/client.ts` 를 고치지 않는다. 적용은 phase 02 다.
모듈과 그 테스트만 만든다.

## 컨텍스트

**근거 문서**: `docs/adr/051-json-large-integer-precision.md`.

Dooray 의 식별자는 19자리 정수다.
`Number.MAX_SAFE_INTEGER` 는 16자리인 9007199254740991 이므로 19자리 값은 Number 로 담을 수 없다.

`JSON.parse` 의 reviver 로는 고칠 수 없다.
reviver 는 이미 Number 로 바뀐 값을 받아 원본 자릿수가 남아 있지 않다.
그래서 파싱 전에 텍스트를 훑어 해당 리터럴을 따옴표로 감싸야 한다.

실측한 손실 예시는 이렇다.

```
원본 텍스트   {"id": 1234567890123456789}
JSON.parse   1234567890123456800
```

**자릿수로 자르지 않고 값으로 판정한다.**
정수 리터럴을 Number 로 읽고 다시 문자열로 만들어 원본과 다를 때만 감싼다.
이러면 안전 범위 안의 값은 Number 로 남아 기존 동작이 그대로다.

## 의도 메모

- **판정과 변환을 이 모듈 하나가 소유한다.** 호출부는 함수 하나만 부른다.
  ADR-051 이 이것을 `ky` 의 `parseJson` 에 꽂는 형태로 쓰기로 정했다.
  그 시그니처는 `node_modules/ky/distribution/types/options.d.ts:68` 이 정의하는
  `(text: string, context: { request: Request; response: Response }) => unknown` 이다.
  두 번째 인자는 이 파서가 쓰지 않으므로 받지 않는다. 인자가 적은 함수도 그 자리에 대입된다.
- 문자열 리터럴 안의 숫자를 건드리면 본문이 바뀐다. 스캐너가 문자열 구간을 반드시 건너뛰어야 한다.
- 실수와 지수 표기는 대상이 아니다. 식별자가 아니고, 문자열로 바꾸면 오히려 타입이 달라진다.

## 작업 항목

### 1. `src/api/json-large-integer.ts` 를 만든다

공개 함수는 하나다.

```ts
export function parseJsonPreservingLargeIntegers(text: string): unknown
```

동작은 둘로 나눈다.

- 텍스트를 훑어 손실이 나는 정수 리터럴을 따옴표로 감싼다
- 그 결과를 `JSON.parse` 에 넘긴다

훑는 규칙은 이렇다.

- **문자열 구간을 건너뛴다.** `"` 를 만나면 닫는 `"` 까지 그대로 통과시킨다.
  그 안의 `\` 는 다음 한 글자를 이스케이프하므로 함께 건너뛴다. `\"` 를 닫는 따옴표로 오인하면 안 된다.
- **숫자 리터럴을 만나면 끝까지 읽는다.** 앞의 `-` 와 숫자와 `.` 와 `e` 와 `E` 와 `+` 와 `-` 가 숫자의 일부다.
- **정수일 때만 판정한다.** 읽어낸 리터럴에 `.` 나 `e` 나 `E` 가 있으면 그대로 둔다.
- **판정**: `String(Number(리터럴)) !== 리터럴` 이면 그 리터럴을 `"` 로 감싼다. 같으면 그대로 둔다.

객체의 키는 JSON 문법상 항상 문자열이라 문자열 건너뛰기에서 자동으로 걸러진다.

`JSON.parse` 가 던지는 오류는 그대로 올린다. 이 모듈이 잡거나 바꾸지 않는다.
잘못된 JSON 을 받았을 때의 처리는 호출부인 `ky` 가 이미 소유한다.

### 2. `src/api/json-large-integer.test.ts` 를 만든다

`vitest` 를 쓴다. 같은 디렉터리에 두는 것이 이 저장소 관례다.

담을 것은 아래 아홉이다.

| 확인할 것 | 입력 | 기대 |
| --- | --- | --- |
| 19자리 정수 보존 | `{"id": 1234567890123456789}` | `id` 가 문자열 `"1234567890123456789"` |
| 안전 범위 정수 유지 | `{"seq": 259}` | `seq` 가 숫자 `259` |
| 타임스탬프 유지 | `{"sentAt": 1788834599820}` | 숫자로 남는다 |
| 경계값 유지 | `{"n": 9007199254740991}` | 숫자로 남는다 |
| 경계 바로 위 보존 | `{"n": 9007199254740993}` | 문자열이 된다 |
| 음수 큰 정수 보존 | `{"n": -1234567890123456789}` | 문자열 `"-1234567890123456789"` |
| 실수는 그대로 | `{"n": 1.5, "e": 1e21}` | 둘 다 숫자로 남는다 |
| 문자열 안의 숫자 불변 | `{"text": "1234567890123456789"}` | 값이 그대로다 |
| 이스케이프된 따옴표 | `{"text": "그는 \"1234567890123456789\" 라 했다", "id": 1234567890123456789}` | 본문은 그대로이고 `id` 만 문자열이 된다 |

실제 응답 모양으로 한 건 더 확인한다.
`direct-send` 응답을 실측한 것이 아래다. 중첩과 여러 필드가 함께 있는 경우를 덮는다.

```json
{"header":{"resultCode":0,"resultMessage":"","isSuccessful":true},"result":{"id":1234567890123456789,"channelId":2222333344445555666,"directMemberId":0,"type":0,"senderId":3333444455556666777,"sentAt":1788834599820,"seq":259,"text":"메시지","unreadCount":0,"mentionCount":0,"flags":0}}
```

`id` 와 `channelId` 와 `senderId` 는 문자열이 되고,
`directMemberId` 와 `type` 과 `sentAt` 과 `seq` 와 `unreadCount` 와 `mentionCount` 와 `flags` 는 숫자로 남아야 한다.

배열 안의 값도 확인한다. `{"ids": [1234567890123456789, 1]}` 에서 앞은 문자열, 뒤는 숫자다.

잘못된 JSON 을 넘기면 던지는지 한 건 확인한다.

## 검증

```bash
# cwd: <repo root>
pnpm tsc --noEmit
pnpm run build
pnpm test
```

셋 다 통과해야 한다.

새 모듈만 골라 돌려 확인한다.

```bash
# cwd: <repo root>
pnpm vitest run src/api/json-large-integer.test.ts
```

파일이 실제로 생겼고 공개 함수가 하나인지 본다.

```bash
# cwd: <repo root>
ls src/api/json-large-integer.ts src/api/json-large-integer.test.ts
grep -c "^export " src/api/json-large-integer.ts        # = 1
grep -c "parseJsonPreservingLargeIntegers" src/api/json-large-integer.ts   # >= 1
```

이 phase 는 `client.ts` 를 고치지 않는다.

```bash
# cwd: <repo root>
git diff --name-only | grep -c "src/api/client.ts"      # = 0
```

## Critical Files

| 파일 | 변경 |
|---|---|
| `src/api/json-large-integer.ts` | 신규 |
| `src/api/json-large-integer.test.ts` | 신규 |
