# Phase 01 — 메일 주소 파서와 id 디코더, 인자 분류기

**Execution profile**: standard

---

## 목표

`dooray mail get` 과 `dooray mail reply` 가 받은 인자를 형태로 가르고, 웹 mail id 에서 도착 시각을 꺼내는 순수 함수를 만든다.

지금은 `Number(uid)` 로 곧장 변환한다.
19자리 mail id 는 JavaScript 안전 정수 범위(2^53-1)를 넘어 값이 바뀌고, 사용자는 자기가 입력하지 않은 숫자가 적힌 오류를 받는다 (GitHub Issue #141).

배경과 실측 근거는 `docs/adr/040-mail-url-to-uid-lookup.md` 에 있다. 작업 전에 읽는다.

**범위 외**: IMAP 조회는 phase 2, 명령 파일 수정은 phase 3 의 책임이다.
이 phase 는 네트워크를 타지 않는 순수 함수와 그 테스트만 만든다.

---

## 작업 항목 (4)

### 1. `src/utils/dooray-url.ts` — 메일 주소 파서 추가

파일 상단의 `TASK_URL_RE` / `WIKI_URL_RE` 옆에 정규식을 두고 아래를 export 한다.

```ts
export interface ParsedMailUrl {
  mailbox: string | null;  // 주소가 가리키는 시스템 폴더 이름, 없으면 null
  mailId: string;
}

export function parseDoorayMailUrl(input: string): ParsedMailUrl | null;
```

- 인식할 형태는 `https://<tenant>.dooray.com/mail/systems/<폴더>/<15자리 이상 숫자>` 다.
  `<폴더>` 자리에는 `inbox` 외에 `sent` 같은 이름도 온다.
- `/mail/` 로 시작하지만 `systems/<폴더>` 형태가 아닌 주소도 마지막 숫자 구간만 잡아 `mailbox: null` 로 돌려준다.
- 뒤에 붙는 `/`, `?query`, `#fragment` 는 무시한다. 기존 `TASK_URL_RE` 의 `(?:[/?#].*)?$` 꼬리 처리를 그대로 따른다.
- 호스트가 `*.dooray.com` 이 아니거나 `/mail/` 경로가 아니면 `null` 을 돌려준다.

### 2. `src/utils/dooray-id.ts` — 신규 파일, id 에서 시각 꺼내기

Dooray id 는 아래 구조다. 이 사실은 ADR-040 이 소유하며, 실제 주소 두 건으로 오차 336ms 와 245ms 를 확인했다.

```
id = (시각_ms - 1262304000000) × 2^23 + 일련번호
```

```ts
export function decodeDoorayIdTimeMs(id: string): number;
```

- 빼는 값 `1262304000000` 은 2010-01-01T00:00:00Z 다. 시프트 폭 23 과 함께 이름 있는 상수로 둔다.
- 계산은 전부 `BigInt` 로 한다. 반환 직전에만 `Number` 로 바꾼다.
  중간에 `Number` 를 쓰면 이 함수가 없애려는 정밀도 손실을 그 자리에서 다시 만든다.
- 입력이 숫자 문자열이 아니면 `DoorayCliError` 를 `EXIT_PARAM_ERROR` 로 던진다.

이 파일을 `dooray-url.ts` 와 나누는 이유는 id 구조가 메일 전용이 아니어서다. postId 와 pageId 도 같은 체계다.

### 3. `src/resolvers/mail-input.ts` — 신규 파일, 인자 분류

`src/resolvers/post-input.ts` 의 `classifyPostInputToken` 을 형태 견본으로 삼되, API 클라이언트를 받지 않는 순수 모듈이다.

```ts
export type MailInputTokenType = "url" | "mailId" | "uid" | "invalid";

export interface MailTarget {
  kind: "uid" | "mailId";
  uid?: number;       // kind 가 "uid" 일 때만
  mailId?: string;    // kind 가 "mailId" 일 때만
  mailbox: string;    // 탐색할 IMAP 사서함, 기본 "INBOX"
}

export function classifyMailInputToken(token: string): MailInputTokenType;
export function resolveMailTarget(token: string): MailTarget;
```

분류 규칙은 다음과 같다.

| 조건 | 판정 |
| --- | --- |
| `/^https?:\/\//` 로 시작 | `url` |
| 숫자만이고 값이 1 이상 4294967295 이하 | `uid` |
| 숫자만이고 값이 4294967295 초과 | `mailId` |
| 그 밖의 모든 입력 (빈 문자열, `0`, 비숫자, 공백 포함) | `invalid` |

상한 4294967295 는 IMAP UID 가 32비트 부호 없는 정수라는 데서 온다. 이름 있는 상수로 둔다.
경계 비교는 반드시 `BigInt(token)` 으로 한다.

`resolveMailTarget` 의 동작은 이렇다.

- `uid` 는 `{ kind: "uid", uid: Number(token), mailbox: "INBOX" }` 를 돌려준다.
- `mailId` 는 `{ kind: "mailId", mailId: token, mailbox: "INBOX" }` 를 돌려준다.
- `url` 은 `parseDoorayMailUrl` 로 풀고, 실패하면 `DoorayCliError` 를 던진다.
  성공하면 `{ kind: "mailId", mailId, mailbox }` 이고 `mailbox` 는 아래 표로 옮긴다.
- `invalid` 는 `DoorayCliError` 를 `EXIT_PARAM_ERROR` 로 던진다.

주소의 폴더 이름과 IMAP 사서함 이름 대응표다. 표에 없는 이름과 `null` 은 `INBOX` 로 둔다.

| 주소의 폴더 | IMAP 사서함 |
| --- | --- |
| `inbox` | `INBOX` |
| `sent` | `sent` |
| `draft` | `draft` |
| `archive` | `archive` |
| `spam` | `spam` |
| `trash` | `trash` |

에러 메시지에는 입력 문자열을 가공 없이 그대로 싣는다. 이것이 이 이슈의 핵심 요구다.
안내 문구는 `post-input.ts` 의 `URL_FORMAT_HINT` 처럼 모듈 상수 하나로 두고 분기들이 공유한다.

### 4. 테스트 추가

- `src/utils/dooray-url.test.ts` 에 `parseDoorayMailUrl` describe 블록을 추가한다.
  기존 describe 들의 케이스 구성을 따라 `inbox` 주소, `sent` 주소, `systems` 가 없는 주소, query·fragment·후행 슬래시, 비 dooray 호스트, 업무 주소 오인식을 덮는다.
- `src/utils/dooray-id.test.ts` 를 새로 만든다.
  `decodeDoorayIdTimeMs("1234567890123456789")` 이 `Number((1234567890123456789n >> 23n) + 1262304000000n)` 과 같은 값을 돌려주는지 확인한다.
  같은 입력을 `Number()` 로 먼저 바꿔 계산한 값과는 다르다는 것도 함께 단언한다. 이 대조가 회귀를 잡는다.
- `src/resolvers/mail-input.test.ts` 를 새로 만든다.
  분류 표의 네 판정을 모두 덮고, 경계값 `4294967295` 와 `4294967296` 을 각각 `uid` 와 `mailId` 로 확인한다.
  `sent` 주소가 `mailbox: "sent"` 로, 알 수 없는 폴더가 `INBOX` 로 떨어지는지 확인한다.
  `resolveMailTarget("1234567890123456789")` 결과의 `mailId` 가 입력 문자열과 문자 단위로 같은지 단언한다.

---

## Critical Files

| 파일 | 변경 |
| --- | --- |
| `src/utils/dooray-url.ts` | 수정 |
| `src/utils/dooray-url.test.ts` | 수정 |
| `src/utils/dooray-id.ts` | 신규 |
| `src/utils/dooray-id.test.ts` | 신규 |
| `src/resolvers/mail-input.ts` | 신규 |
| `src/resolvers/mail-input.test.ts` | 신규 |

## 검증

```bash
# cwd: <repo root>
pnpm vitest run src/utils/dooray-url.test.ts src/utils/dooray-id.test.ts src/resolvers/mail-input.test.ts
pnpm tsc --noEmit
```

- 세 테스트 파일이 모두 통과한다.
- `pnpm tsc --noEmit` 출력이 이 phase 시작 전과 같다. 새 오류가 0 건이어야 한다.
- `grep -n "1262304000000\|4294967295" src/utils/dooray-id.ts src/resolvers/mail-input.ts` 가 각 상수 정의를 1 줄씩 찾는다.
- `grep -n "Number(" src/utils/dooray-id.ts` 결과가 1 줄이다. 반환 직전 변환 외에 `Number` 가 없어야 한다.

## 의도 메모 (왜)

- id 구조와 32비트 경계의 근거, 기각한 대안은 `docs/adr/040-mail-url-to-uid-lookup.md` 에 있다.
- 분류를 조회보다 앞에 두면 안전 정수 범위 밖 값이 `Number()` 에 도달하지 않는다. 정밀도 손실이 방어가 아니라 구조로 사라진다.
- 순수 함수로 분리하면 IMAP 연결 없이 테스트할 수 있다. 이 결함은 네트워크와 무관한데 기존 코드에서는 명령 실행 없이 확인할 방법이 없었다.

## Blocked 조건

- `docs/adr/040-mail-url-to-uid-lookup.md` 가 없으면 `PHASE_BLOCKED: ADR-040 부재 — 이 plan 의 docs 커밋이 base 에 없다` 를 출력하고 멈춘다.
