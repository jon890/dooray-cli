# Phase 01 — 메일 URL 파서와 인자 분류기 추가

**Execution profile**: standard

---

## 목표

`dooray mail get` 과 `dooray mail reply` 가 받은 인자를 조회 전에 형태로 분류하는 순수 함수를 만든다.

지금은 `Number(uid)` 로 곧장 변환한다.
Dooray 웹 메일 주소에 들어 있는 19자리 mail id 를 넣으면 JavaScript 안전 정수 범위(2^53-1)를 넘어 값이 바뀌고,
사용자는 자기가 입력하지 않은 숫자가 적힌 오류를 받는다 (GitHub Issue #141).

배경 결정은 `docs/adr/040-mail-web-url-not-mappable.md` 에 있다. 작업 전에 읽는다.

**범위 외**: 명령 파일(`src/commands/mail/get.ts`, `src/commands/mail/reply.ts`) 수정은 phase 2 의 책임이다.
이 phase 는 새 함수와 그 테스트만 만든다. mail id 를 IMAP UID 로 매핑하는 기능은 이 plan 전체의 범위 밖이다.

---

## 작업 항목 (3)

### 1. `src/utils/dooray-url.ts` — 메일 주소 파서 추가

파일 상단의 `TASK_URL_RE` / `WIKI_URL_RE` 옆에 정규식을 두고, 아래 함수를 export 한다.

```ts
export function parseDoorayMailUrl(input: string): string | null
```

- 인식할 형태는 `https://<tenant>.dooray.com/mail/<폴더 경로...>/<15자리 이상 숫자>` 이다.
  실제 주소는 `https://<tenant>.dooray.com/mail/systems/inbox/1234567890123456789` 형태이고,
  `inbox` 자리에는 `sent` 같은 다른 폴더 이름도 온다.
- 뒤에 붙는 `/`, `?query`, `#fragment` 는 무시하고 숫자만 돌려준다.
  기존 `TASK_URL_RE` 의 `(?:[/?#].*)?$` 꼬리 처리를 그대로 따른다.
- 호스트가 `*.dooray.com` 이 아니거나 `/mail/` 경로가 아니면 `null` 을 돌려준다.

### 2. `src/resolvers/mail-input.ts` — 신규 파일

`src/resolvers/post-input.ts` 의 `classifyPostInputToken` 을 형태 견본으로 삼되, 그 파일과 달리 API 클라이언트를 받지 않는 순수 모듈이다.

```ts
export type MailInputTokenType = "url" | "webMailId" | "uid" | "invalid";

export function classifyMailInputToken(token: string): MailInputTokenType;
export function resolveMailUid(token: string): number;
```

분류 규칙은 다음과 같다.

| 조건 | 판정 |
| --- | --- |
| `/^https?:\/\//` 로 시작 | `url` |
| 숫자만이고 값이 1 이상 4294967295 이하 | `uid` |
| 숫자만이고 값이 4294967295 초과 | `webMailId` |
| 그 밖의 모든 입력 (빈 문자열, `0`, 비숫자, 공백 포함) | `invalid` |

경계 비교는 반드시 `BigInt(token)` 으로 한다.
`Number()` 로 비교하면 정밀도 손실 여부를 판정하는 자리에서 그 정밀도를 다시 잃는다.
상한 4294967295 는 IMAP UID 가 32비트 부호 없는 정수라는 데서 온다. 이 값을 이름 있는 상수로 둔다.

`resolveMailUid` 는 `uid` 판정일 때만 `Number(token)` 을 돌려주고, 나머지는 `DoorayCliError` 를 `EXIT_PARAM_ERROR` 로 던진다.
에러 메시지에는 **입력 문자열을 가공 없이 그대로** 싣는다. 이것이 이 이슈의 핵심 요구다.

- `url` 과 `webMailId` 는 같은 안내 본문을 쓴다. 첫 줄만 각각 "웹 메일 주소입니다" 와 "웹 메일의 mail id 로 보입니다" 로 가른다.
  본문에는 두 체계를 변환할 수 없다는 사실과 아래 우회 절차를 넣는다.

  ```
  dooray mail list --search "<제목 일부>"
  dooray mail get <uid>
  ```

- `invalid` 는 "UID 는 `mail list` 가 보여주는 숫자입니다" 취지의 형식 안내를 쓴다.

안내 문구는 `post-input.ts` 의 `URL_FORMAT_HINT` 처럼 모듈 상수 하나로 두고 두 분기가 공유한다. 문자열을 복제하지 않는다.

### 3. 테스트 추가

- `src/utils/dooray-url.test.ts` 에 `parseDoorayMailUrl` describe 블록을 추가한다.
  기존 describe 들의 케이스 구성을 따라 정상 주소, 폴더가 다른 주소, query·fragment·후행 슬래시, 비 dooray 호스트, 업무 주소 오인식을 덮는다.
- `src/resolvers/mail-input.test.ts` 를 새로 만든다.
  분류 표의 네 판정을 모두 덮고, 경계값 `4294967295` 와 `4294967296` 을 각각 `uid` 와 `webMailId` 로 확인한다.
  `resolveMailUid("1234567890123456789")` 이 던지는 에러 메시지에 그 19자리 문자열이 **변형 없이** 들어 있는지 단언한다.
  이 단언이 이번 회귀를 잡는 검사다.

---

## Critical Files

| 파일 | 변경 |
| --- | --- |
| `src/utils/dooray-url.ts` | 수정 |
| `src/utils/dooray-url.test.ts` | 수정 |
| `src/resolvers/mail-input.ts` | 신규 |
| `src/resolvers/mail-input.test.ts` | 신규 |

## 검증

```bash
# cwd: <repo root>
pnpm vitest run src/resolvers/mail-input.test.ts src/utils/dooray-url.test.ts
pnpm tsc --noEmit
```

- 두 테스트 파일이 모두 통과한다.
- `pnpm tsc --noEmit` 출력이 이 phase 시작 전과 같다. 새 오류가 0 건이어야 한다.
- `grep -n "4294967295" src/resolvers/mail-input.ts` 가 상수 정의 1 줄을 찾는다.
- `grep -rn "Number(" src/resolvers/mail-input.ts` 결과에 경계 비교가 없다. `Number()` 는 `uid` 확정 후 반환 자리에만 나타난다.

## 의도 메모 (왜)

- 32비트 경계로 두 체계를 가르는 근거와 기각한 대안은 `docs/adr/040-mail-web-url-not-mappable.md` 에 있다.
- 분류를 조회보다 앞에 두면 안전 정수 범위 밖 값이 `Number()` 에 도달하지 않는다. 정밀도 손실이 방어가 아니라 구조로 사라진다.
- 순수 함수로 분리하면 IMAP 연결 없이 테스트할 수 있다. 이 결함은 네트워크와 무관한데 기존 코드에서는 명령 실행 없이 확인할 방법이 없었다.

## Blocked 조건

- `docs/adr/040-mail-web-url-not-mappable.md` 가 없으면 `PHASE_BLOCKED: ADR-040 부재 — 이 plan 의 docs 커밋이 base 에 없다` 를 출력하고 멈춘다.
