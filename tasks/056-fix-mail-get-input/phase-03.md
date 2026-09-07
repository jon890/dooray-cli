# Phase 03 — mail get·reply 배선과 통합 검증

**Execution profile**: standard

---

## 목표

phase 1 과 2 의 산출물을 두 명령에 연결해, 메일 웹 주소와 19자리 mail id 로도 메일을 조회할 수 있게 한다.

**범위 외**: `mail list` 와 `mail send` 는 손대지 않는다.

**전제**: 이 phase 는 phase 1 의 `src/resolvers/mail-input.ts` 와 phase 2 의 `resolveUidByMailId` 를 전제한다.
둘 중 하나라도 없으면 base 를 확인하고 멈춘다.

---

## 작업 항목 (4)

### 1. `src/resolvers/mail-input.ts` — UID 확정 헬퍼 추가

명령 두 곳이 같은 순서를 반복하지 않도록 분류와 조회를 잇는 함수를 이 파일에 둔다.

```ts
export async function resolveMailUid(config: Config, token: string): Promise<{ uid: number; mailbox: string }>;
```

- `resolveMailTarget(token)` 으로 형태를 가른다.
- `kind` 가 `"uid"` 면 그대로 돌려준다. IMAP 에 붙지 않는다.
- `kind` 가 `"mailId"` 면 `resolveUidByMailId(config, mailId, mailbox)` 를 부른다.

이 함수만 `src/api/imapClient.ts` 를 참조한다. 분류 함수들은 순수한 채로 남긴다.

### 2. `src/commands/mail/get.ts` — 인자 해석 삽입

`src/commands/mail/get.ts:17` 의 `await getMail(config, Number(uid))` 를 고친다.

- 인자 이름을 `<uid>` 에서 `<target>` 으로 바꾸고 설명을 `"메일 UID / 메일 웹 주소 / 웹 주소의 mail id"` 로 쓴다.
- `resolveMailTarget(target)` 의 형태 판정을 **`getConfigOrThrow()` 보다 앞**에서 부른다.
  잘못된 형태에 돌려줄 것은 형식 안내이지 IMAP 설정 안내가 아니다.
- 형태가 통과하면 설정을 읽고 `resolveMailUid(config, target)` 로 UID 를 얻은 뒤 `getMail(config, uid, mailbox)` 를 부른다.
- mail id 로 들어온 경우 스피너 문구를 `"메일 찾는 중..."` 으로 두고, UID 를 얻은 뒤 `"메일 조회 중..."` 으로 바꾼다.
  UID 직접 입력은 지금처럼 `"메일 조회 중..."` 하나만 쓴다.

### 3. `src/commands/mail/reply.ts` — 같은 배선

`src/commands/mail/reply.ts:58` 의 `getMail(config, Number(uid))` 와 `:59` 의 `getMessageId(config, Number(uid))` 가 같은 결함을 갖는다.

- `resolveMailUid` 를 한 번만 불러 결과를 지역 변수에 담고 두 호출이 공유한다.
- `getMessageId` 의 시그니처에도 `mailbox` 를 넘긴다. 이 함수는 같은 파일 안에 있고 `getMailboxLock("INBOX")` 를 직접 부른다.
- 인자 이름과 설명을 get.ts 와 같은 기준으로 바꾼다.
- 본문 누락 검사(`--body` / `--body-file`)는 지금 위치를 유지한다. 형태 판정보다 뒤에 있어도 둘 다 IMAP 에 붙기 전이다.

### 4. 명령 수준 테스트

`src/commands/mail/logout.test.ts` 가 이 디렉터리의 `vi.mock` 사용 견본이다.

`src/commands/mail/get.test.ts` 를 만들어 `mailGetCommand` 를 직접 구동한다.

```ts
await mailGetCommand.parseAsync(["<인자>"], { from: "user" });
```

commander 의 action 이 던진 오류는 `parseAsync` 의 거부로 전달되므로 `rejects.toMatchObject({ exitCode: EXIT_PARAM_ERROR })` 로 단언할 수 있다.

- 잘못된 형태(`abc`)를 넘기면 `getConfigOrThrow` 가 호출되지 않고 거부된다.
- 메일 웹 주소를 넘기면 `resolveUidByMailId` 가 주소에서 뽑은 mail id 와 사서함 이름으로 호출된다.
- 19자리 mail id 를 넘기면 `resolveUidByMailId` 가 그 문자열과 문자 단위로 같은 값을 받는다.
- 정상 UID 를 넘기면 `resolveUidByMailId` 가 호출되지 않고 `getMail` 이 숫자 인자로 호출된다.

`../../api/imapClient.js` 와 `../../config/store.js` 를 모의한다. 검증 대상인 분류 모듈은 모의하지 않는다.

`parseAsync` 구동이 이 레포에서 처음이라면 첫 케이스를 먼저 통과시켜 방식이 성립하는지 확인한 뒤 나머지를 쓴다.
성립하지 않으면 `get.ts` 의 action 본문을 export 된 함수로 분리해 그 함수를 직접 부른다. 테스트를 위해 프로덕션 동작을 바꾸지는 않는다.

---

## Critical Files

| 파일 | 변경 |
| --- | --- |
| `src/resolvers/mail-input.ts` | 수정 |
| `src/commands/mail/get.ts` | 수정 |
| `src/commands/mail/reply.ts` | 수정 |
| `src/commands/mail/get.test.ts` | 신규 |
| `tasks/056-fix-mail-get-input/index.json` | 수정 (완료 마킹) |

## 검증

```bash
# cwd: <repo root>
pnpm vitest run
pnpm tsc --noEmit
pnpm run build
```

- 전체 테스트가 통과한다.
- `pnpm tsc --noEmit` 새 오류 0 건.
- `grep -rn "Number(uid)" src/commands/mail/` 결과가 0 줄이다. 세 곳이 모두 사라져야 한다.

빌드 산출물로 형태 판정을 확인한다. IMAP 설정 없이도 즉시 끝나야 한다.

```bash
# cwd: <repo root>
node dist/index.js mail get abc; echo "exit=$?"
node dist/index.js mail get "https://example.dooray.com/task/to/1234567890123456789"; echo "exit=$?"
```

- 두 명령 모두 `exit=3` 으로 끝나고 형식 안내를 낸다.
- 첫 명령 출력에 `abc` 가, 둘째 출력에 입력한 주소가 그대로 들어 있다.

IMAP 설정이 있는 환경이면 실제 조회까지 확인한다. 설정이 없으면 이 항목을 건너뛰고 그 사실을 보고에 남긴다.

```bash
# cwd: <repo root>
node dist/index.js mail list --limit 1 --json    # UID 와 도착 시각을 확인한다
```

이 UID 로 `mail get <uid>` 가 되던 메일을, 같은 메일의 웹 주소로도 조회해 같은 제목이 나오는지 대조한다.

## 완료 처리

검증을 모두 통과하면 `tasks/056-fix-mail-get-input/index.json` 을 갱신한다.

- 세 phase 의 `status` 를 `completed` 로 바꾼다.
- 최상위 `status` 를 `completed`, `current_phase` 를 `3`, `updated_at` 을 실행일로 바꾼다.

## 의도 메모 (왜)

- 형태 판정을 설정 조회보다 앞에 두는 것은 이 레포의 삭제 명령 비대화형 선차단(ADR-036)과 같은 순서 원칙이다.
  거절이 확정된 입력에는 부수 효과를 만들지 않는다.
- `reply` 는 이슈에 적히지 않았지만 같은 인자를 같은 방식으로 파싱한다. 한쪽만 고치면 같은 신고가 다시 들어온다.
- UID 직접 입력에서 `resolveUidByMailId` 를 부르지 않는 것은 조회 한 번으로 끝나던 경로에 탐색 비용을 얹지 않기 위해서다.

## Blocked 조건

- `src/resolvers/mail-input.ts` 또는 `resolveUidByMailId` 가 없으면 `PHASE_BLOCKED: 선행 phase 산출물 부재` 를 출력하고 멈춘다.
