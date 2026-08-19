# Phase 02 — mail get·reply 배선과 통합 검증

**Execution profile**: standard

---

## 목표

phase 1 이 만든 `resolveMailUid` 를 두 명령에 연결해, 웹 메일 주소와 19자리 mail id 가 IMAP 조회에 도달하지 않게 한다.

**범위 외**: `src/api/imapClient.ts` 는 손대지 않는다.
분류기가 앞에서 막으므로 정밀도를 잃을 값이 `getMail` 에 도달하지 않는다.
mail id 를 UID 로 매핑하는 기능도 범위 밖이다 (`docs/adr/040-mail-web-url-not-mappable.md`).

**전제**: 이 phase 는 phase 1 이 만드는 `src/resolvers/mail-input.ts` 를 전제한다.
그 파일이 없으면 base 를 확인하고 멈춘다.

---

## 작업 항목 (3)

### 1. `src/commands/mail/get.ts` — 인자 검증 삽입

`src/commands/mail/get.ts:17` 의 `await getMail(config, Number(uid))` 를 고친다.

- `resolveMailUid(uid)` 를 **`startSpinner` 보다 앞**에서 호출한다.
  잘못된 입력에 스피너를 띄웠다가 곧바로 지우면 오류 메시지가 스피너 잔상과 겹친다.
- `getConfigOrThrow()` 와의 순서도 검증이 앞선다.
  IMAP 설정이 없는 사용자가 주소를 붙여 넣었을 때, 받아야 할 안내는 형식 안내이지 설정 안내가 아니다.
- 인자 설명 문자열 `"메일 UID"` 를 `"메일 UID (mail list 가 보여주는 숫자)"` 로 바꾼다.

### 2. `src/commands/mail/reply.ts` — 같은 결함 2곳

`src/commands/mail/reply.ts:58` 의 `getMail(config, Number(uid))` 와 `:59` 의 `getMessageId(config, Number(uid))` 가 같은 결함을 갖는다.

- `resolveMailUid(uid)` 를 한 번만 호출해 결과를 지역 변수에 담고 두 호출이 공유한다.
- 호출 위치는 get.ts 와 같은 기준을 따른다. 설정 조회와 스피너보다 앞이다.
- 인자 설명 `"원본 메일 UID"` 도 같은 방식으로 보강한다.

### 3. 명령 수준 테스트

`src/commands/mail/logout.test.ts` 가 이 디렉터리의 `vi.mock` 사용 견본이다. 모의 방식은 그 파일을 따른다.

`src/commands/mail/get.test.ts` 를 만들어 `mailGetCommand` 를 직접 구동한다.

```ts
await mailGetCommand.parseAsync(["<인자>"], { from: "user" });
```

commander 의 action 이 던진 오류는 `parseAsync` 의 거부로 전달되므로, `rejects.toMatchObject({ exitCode: EXIT_PARAM_ERROR })` 로 단언할 수 있다.

- 웹 메일 주소를 넘기면 `getConfigOrThrow` 와 `getMail` 이 **호출되지 않고** 거부된다.
- 19자리 mail id 를 넘기면 같은 결과이고, 거부 메시지에 그 문자열이 변형 없이 들어 있다.
- 정상 UID 를 넘기면 `getMail` 이 숫자 인자로 호출된다.

IMAP 에 실제로 접속하지 않도록 `../../api/imapClient.js` 와 `../../config/store.js` 를 모의한다.
검증 대상 모듈 자신(`resolveMailUid`)은 모의하지 않는다.

`parseAsync` 구동이 이 레포에서 처음이라면, 첫 케이스를 먼저 통과시켜 방식이 성립하는지 확인한 뒤 나머지를 쓴다.
성립하지 않으면 `get.ts` 의 action 본문을 export 된 함수로 분리해 그 함수를 직접 부른다. 테스트를 위해 프로덕션 동작을 바꾸지는 않는다.

---

## Critical Files

| 파일 | 변경 |
| --- | --- |
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
- 빌드 산출물로 실제 동작을 확인한다. 세 명령 모두 IMAP 접속 없이 즉시 끝나야 한다.

  ```bash
  # cwd: <repo root>
  node dist/index.js mail get "https://example.dooray.com/mail/systems/inbox/1234567890123456789"; echo "exit=$?"
  node dist/index.js mail get 1234567890123456789; echo "exit=$?"
  node dist/index.js mail reply 1234567890123456789 --body x; echo "exit=$?"
  ```

  각 명령이 `exit=3` 으로 끝나고, 출력에 `1234567890123456789` 이 그대로 들어 있다.
  이 문자열이 다른 숫자로 바뀌어 나오면 이번 수정이 실패한 것이다.

## 완료 처리

검증을 모두 통과하면 `tasks/056-fix-mail-get-input/index.json` 을 갱신한다.

- 두 phase 의 `status` 를 `completed` 로 바꾼다.
- 최상위 `status` 를 `completed`, `current_phase` 를 `2`, `updated_at` 을 실행일로 바꾼다.

## 의도 메모 (왜)

- 검증을 설정 조회와 스피너보다 앞에 두는 것은 이 레포의 삭제 명령 비대화형 선차단(ADR-036)과 같은 순서 원칙이다.
  거절이 확정된 입력에는 부수 효과를 만들지 않는다.
- `reply` 는 이슈에 적히지 않았지만 같은 인자를 같은 방식으로 파싱한다.
  한쪽만 고치면 같은 신고가 다시 들어온다.
