# Code Review Pitfalls

build-with-teams 의 code-reviewer 가 반복 지적한 코드 패턴. **plan 작성 시점이 아니라 executor 의 코드 작성 시점에 사전 해소** 한다 (common-pitfalls 는 plan 작성 회피, 본 docs 는 코드 작성 회피 — 호출 시점이 다름).

## 호출 시점

| 시점 | 누가 | 어떻게 |
|---|---|---|
| plan 작성 | team-lead | phase 본문에 "회피 항목" 으로 1줄 인용 (executor 가 그 phase 만 보고도 알 수 있도록) |
| executor 코드 작성 시작 직전 | executor | 이 docs 의 해당 카테고리 grep → self-check |
| code-reviewer 검사 | code-reviewer | build-with-teams 7단계 13 항목과 별도로 본 docs 의 모든 항목 grep 게이트 |

## 축적 규칙

- 새 항목 추가 = code-reviewer 가 같은 패턴을 **plan 종료 후 회고 단계에서 발견** 했을 때만. 1회성 단일 사고는 제외 (반복성 확보 후 추가).
- 항목 형식: **증상 / 왜 / 검출 명령 / Self-check**. common-pitfalls 와 동일.
- "왜 이 가드가 필요한지" 1줄 단서 필수 — 미래 AI 가 의도 모르고 우회하지 않도록.
- plan### 사고 사례는 1개로 충분, 복수 나열 금지.
- 카테고리는 4개로 시작, 새 패턴이 어느 카테고리에도 안 들어가면 5번 카테고리 추가.

---

# 1. spinner·UX 순서 회귀

executor 가 헬퍼 추출·재배치 리팩토링 / 신규 명령 작성 시 spinner / validation / cleanup 순서를 의도치 않게 바꾸는 사고.

## 1-1. validation 전에 spinner 시작 (param 에러 시 spinner leak)

**증상**: `startSpinner(...)` 가 `resolve*Input(...)` / param 검증 **앞** 에 있음. 파라미터 오류 발생 시 spinner 가 떠 있는 채 stderr 에 에러 메시지가 흘러 ora 애니메이션 문자와 섞임.
**Good**: 헬퍼 호출 (`resolveCommentFileInput` / `resolvePostInput` 등) 을 spinner 보다 앞에 두고, 같은 명령군 내 일관성 유지.

```bash
# 같은 명령군 내 spinner ↔ 헬퍼 순서 일관성 검증
for f in src/commands/<scope>/*.ts; do
  echo "--- $f ---"
  awk '/\.action\(async/,/^  \}\)\;/' "$f" | \
    grep -nE "(startSpinner|resolve[A-Z][A-Za-z]*Input)" | head -5
done
```

**Why**: plan025 PR #47 — `comment/file/list.ts` 만 4 명령 중 spinner 가 헬퍼 앞에 있어 회귀.

## 1-2. spinner 시작 후 try/catch 없이 API 호출 → 에러 시 spinner leak

**증상**: `startSpinner` 직후 외부 API 호출 (`resolvePostInput`, `client.getXxx` 등) 을 평이하게 호출. 호출 중 예외 발생 시 `stopSpinner` 가 절대 호출 안 됨 → spinner 가 화면에 정지 상태로 잔존.
**Good**: spinner 가 떠 있는 동안의 모든 외부 호출을 try/catch 로 감싸고 catch 에서 `stopSpinner(false)` 명시 호출 후 re-throw.

```ts
startSpinner("...");
try {
  const result = await client.fetchSomething(...);
  stopSpinner(true, "...");
  // 이후 처리
} catch (e) {
  stopSpinner(false);
  throw e;
}
```

**검출**: `grep -A 20 "startSpinner" src/commands/` 결과에서 `try\s*\{` 가 같은 블록 내 없으면 의심.
**Why**: PR #46 — `comment/get.ts` 의 `startSpinner` 후 `resolvePostInput` / `getPostComment` 가 try 없이 호출 → 에러 경로 spinner 잔존. 1-1 과 다른 패턴 (1-1 은 호출 위치, 1-2 는 cleanup 누락).

**기존 spinner 블록에 새 헬퍼 호출 추가 / 위치 이동 시 (재발 패턴)**: spinner 블록 내부에 새 헬퍼 (`readBodyInput`, `resolveTemplate`, `getProjectTemplateDetail` 등) 호출을 추가하거나 spinner 전에 있던 호출을 spinner 후로 이동하는 경우, 그 새 위치도 동일하게 try/catch 보호가 필요하다. spinner 전에 있을 때는 안전했던 호출 (예: `readBodyInput` 의 파일 부재 throw) 이 spinner 후 위치로 이동하면 leak 경로가 생긴다.

```ts
// PR #64 — readBodyInput 을 template body fallback 로직 위해 spinner 후로 이동.
// 이동 자체는 OK 지만 try/catch 보호 누락 → spinner leak.
startSpinner("...");
const projectId = await resolveProject(client, project);
// ... template fetch (이미 try/catch 보호됨) ...
let bodyContent: string;
try {
  bodyContent = await readBodyInput(opts);  // ← spinner 후 위치로 이동했으면 try/catch 필수
} catch (e) {
  stopSpinner(false);
  throw e;
}
```

**Self-check (plan / code review)**: 기존 spinner 블록 내부에 새 호출을 추가하거나 spinner 외부 호출을 내부로 이동하는 diff 가 있으면, 그 호출의 throw 경로를 따로 grep 으로 확인 (`grep -nE "throw new (DoorayCliError|Error)" {호출 파일}`). 1건이라도 throw 가능하면 try/catch 보호 필요.

## 1-3. resolver 를 body 수집·editor open 보다 뒤에 호출 (resolver-before-editor)

**증상**: `resolveWikiPageInput` / `resolvePostInput` 같은 resolver 호출이 `readBodyInputOrNull` / `openInEditor` 보다 뒤에 있음.
resolver 실패 시 사용자가 이미 에디터에 입력한 내용이 유실됨.

**Good**: resolver 를 항상 `readBodyInputOrNull` / `openInEditor` 보다 먼저 호출.
`delete.ts` / `edit.ts` 패턴이 reference.

**검출**:
```bash
grep -B 5 "openInEditor\|readBodyInputOrNull" src/commands/ | grep -B 5 -A 1 "resolve[A-Z][A-Za-z]*Input"
# resolver 호출이 뒤에 있으면 의심
```

**Why**: PR #74 (plan036) 와 PR #64 (plan031) 2회 반복.
add 명령군에서 특히 발생.

**Self-check**: add / edit 명령 작성 시 resolver 호출 순서가 body 수집보다 앞인지 grep 으로 확인했는가?

---

# 2. 에러 처리 일관성

## 2-1. `await fn()` 에서 `fn(): Promise<never>` 라도 catch 블록이 never-path 로 추론 안 됨 (TS2366)

**증상**: 헬퍼 `async function bail(...): Promise<never>` 를 catch 블록에서 `await bail(e)` 만 호출하고 끝냄 (`return` / `throw` 없음). bare `await Promise<never>` 는 런타임에는 throw 로 unwind 되지만 TypeScript control-flow 분석은 catch 블록을 never-returning 으로 못 잡고 `TS2366: Function lacks ending return statement and return type does not include 'undefined'` 발생.

**Good**: `return await bail(e)` 로 control flow 종결을 명시. async 시그니처를 유지하면서 호출자 패턴만 바꾸는 리팩토링에서 특히 주의.

```ts
// BAD — TS2366
} catch (e) {
  await toDoorayCliError(e);   // bare await of Promise<never>
}

// GOOD
} catch (e) {
  return await toDoorayCliError(e);
}
```

**검출**:
```bash
# tsc 직접 검증 (tsup/esbuild 는 type-check 스킵 — build/test 통과해도 TS2366 누수 가능)
pnpm tsc --noEmit 2>&1 | grep -c "TS2366"
# 기대: 0

# bare await 잔존 grep
grep -nE "^\s+await\s+\w+\(.*\);?\s*$" src/api/client.ts | grep -v "return"
```

**Self-check**: catch 블록의 헬퍼 호출 패턴을 바꾸는 리팩토링이라면 빌드만 보지 말고 `pnpm tsc --noEmit` 을 반드시 실행 — tsup/vitest 가 type-check 를 우회하므로 빌드/테스트 PASS 가 type 안전성을 의미하지 않는다.

**Why**: plan026 PR #48 — `return toDoorayCliError(e)` → `await toDoorayCliError(e)` 일괄 치환 시 34곳 모두 TS2366. tsup 빌드 + 91 tests 통과로 1차 검증을 빠져나갔고, code-reviewer 가 `tsc --noEmit` 으로 잡음. async 시그니처를 유지한 호출자 리팩토링은 type-check 없이는 안전하지 않다.

## 2-2. catch 의 `err.exitCode` 분기 시 `toDoorayCliError` 의 실제 매핑 미확인

**증상**: resolver / command 에서 `catch (err)` 후 `err instanceof DoorayCliError && err.exitCode === EXIT_PARAM_ERROR` 같은 분기로 "특정 에러만 변환 + 나머지 re-throw" 를 시도. 하지만 `toDoorayCliError` (src/api/client.ts) 는 HTTP 에러에 `EXIT_AUTH_ERROR` (401/403) 또는 `EXIT_API_ERROR` (그 외, 404 포함) 만 부여. `EXIT_PARAM_ERROR` (3) 는 CLI 자체 입력 검증 경로에서만 발생 — API 호출 경로의 catch 에서는 절대 매칭 안 됨. 결과: 분기 조건이 항상 false → "특정 에러 변환" 코드가 dead path 가 되고, 사용자는 의도된 친절 메시지 대신 raw 에러를 봄.

**Good**: catch 안에서 HTTP 에러를 분류하려면 `EXIT_API_ERROR` (404 포함 4xx/5xx) 와 `EXIT_AUTH_ERROR` (401/403) 중에서 선택. status code 까지 구분하려면 `err.message` 의 `(404)` 패턴이나 별도 metadata 가 필요 — 단순 exitCode 비교로는 404 / 5xx / timeout 을 구별 못함을 인지하고 설계.

```ts
// BAD — EXIT_PARAM_ERROR 는 API 경로에서 절대 발생 안 함 → 분기 항상 false
try { await client.getMemberDetail(input); } catch (err) {
  if (err instanceof DoorayCliError && err.exitCode === EXIT_PARAM_ERROR) {
    throw new DoorayCliError("찾을 수 없습니다", EXIT_PARAM_ERROR);
  }
  throw err;
}

// GOOD — toDoorayCliError 의 실제 매핑 (EXIT_API_ERROR for 404) 사용
try { await client.getMemberDetail(input); } catch (err) {
  if (err instanceof DoorayCliError && err.exitCode === EXIT_API_ERROR) {
    throw new DoorayCliError("찾을 수 없습니다", EXIT_PARAM_ERROR);
  }
  throw err;   // EXIT_AUTH_ERROR / 네트워크 에러는 분류 보존
}
```

**검출**: catch 안의 exitCode 검사 패턴 + `EXIT_PARAM_ERROR` 사용 여부.
```bash
grep -rnE "exitCode\s*===\s*EXIT_PARAM_ERROR" src/resolvers/ src/commands/ src/api/
# 결과 있으면 → API 경로의 catch 인지 확인. API 경로면 → EXIT_API_ERROR 로 교체
```

**Self-check**: catch 안에서 exitCode 분기를 쓰는 코드를 작성/리뷰할 때, `src/api/client.ts` 의 `toDoorayCliError` 가 그 에러 케이스에 어떤 exitCode 를 *실제로* 부여하는지 grep 으로 확인했는가? mock 으로 짠 테스트가 그 exitCode 를 mirror 하는가?

**Why**: PR #63 (plan029) — `resolveMember` 의 catch 가 `EXIT_PARAM_ERROR` 검사. 테스트도 같은 값으로 reject 해서 7/7 PASS 였지만 실제 production path 의 `toDoorayCliError` 는 `EXIT_API_ERROR` 부여 → 분기 dead. code-reviewer 가 catch 케이스 ↔ toDoorayCliError 매핑 대조해서 잡음. 다른 resolver/command 에서 같은 패턴 추가 시 또 발생 가능.

## 2-3. 테스트 mock 의 reject value 가 production path 를 mirror 안 함

**증상**: `vi.fn().mockRejectedValue(new DoorayCliError("...", EXIT_PARAM_ERROR))` 같이 mock 을 만들 때, 실제 production path 의 에러 객체 (`toDoorayCliError` 가 부여하는 exitCode / 메시지 prefix) 와 다른 값을 사용. 테스트는 통과 (mock 이 그 값을 reject 하니까) 하지만 실제 코드 경로는 다른 exitCode 를 받음 → 분기/메시지 변환 코드가 실제로는 동작 안 함. 테스트가 자기 자신만 검증하고 production 검증 못함.

**Good**: API client 함수의 throw path 가 `toDoorayCliError` 를 통과한다면 mock 도 같은 함수가 만들 객체를 흉내내야 함:
- HTTP 4xx (404 포함) → `new DoorayCliError("API 호출 실패: <메시지>", EXIT_API_ERROR)`
- HTTP 401/403 → `new DoorayCliError(..., EXIT_AUTH_ERROR)`
- 네트워크 / timeout → `new Error("ECONNREFUSED")` 등 raw Error (DoorayCliError 아님 — toDoorayCliError 가 unwrap 안 함)

**검출**:
```bash
grep -rnE "mockRejectedValue\(new DoorayCliError" src/ test/
# 결과의 EXIT_* 값이 toDoorayCliError 매핑 (EXIT_API_ERROR / EXIT_AUTH_ERROR) 인지 확인
```

**Self-check**: mock 의 reject value 를 작성할 때, "이 mock 이 흉내내려는 production 호출 경로에서 실제로 어떤 형태의 Error 가 던져지는가?" 를 코드로 직접 확인했는가 — 아니면 "에러면 그냥 Error 든 DoorayCliError 든 통과하니까" 로 임시값 넣었는가?

**Why**: PR #63 (plan029) — 7/7 테스트 PASS 였지만 mock 이 production 동작 mirror 안 함. mock 만 보면 분기 코드 검증된 것처럼 보이지만 실제 path 는 dead. code-reviewer 가 production path (`toDoorayCliError`) 와 mock 의 exitCode 대조로 잡음. 2-2 와 짝 — 같은 사고가 코드와 테스트 양쪽에서 동시 발생.

# 3. 매직 넘버·문자열 (예약)

# 4. CLI 도메인 규칙 회귀

## 4-1. interactive 경고 vs 실제 동작 mismatch

**증상**: interactive 분기에서 "옵션 X 는 무시됩니다" 경고를 추가했으나 실제로 옵션 resolve 로직이 interactive 경로에도 적용됨.
경고 텍스트와 코드 경로가 정반대.

**Good**: 경고 텍스트 추가 시 해당 옵션의 resolve/merge 로직이 `nonInteractive` 조건 안에만 있는지 grep 으로 확인.

**검출**:
```bash
grep -B 3 -A 10 "무시됩니다\|ignored" src/commands/
# 같은 옵션 grep 으로 nonInteractive 조건 외에서 사용되는지 확인
```

**Why**: PR #55 (plan028) 🔴 — cc/to 옵션 경고와 실제 동작 불일치.

**Self-check**: 경고 문구와 실제 코드 경로가 일치하는가?
경고 옵션 이름이 `nonInteractive` 조건 안에만 있는지 grep 으로 확인했는가?

# 5. 타입 안전성

## 5-1. Map.has → get()! non-null assertion

**증상**: `map.has(k) ? map.get(k)!.use() : map.set(k, init)` 패턴에서 `!` 사용.
TypeScript 는 `has` 후 `get` 을 narrowing 안 함 → 런타임 undefined 가능성 잔존.

**Good**: `let v = map.get(k); if (!v) { v = init; map.set(k, v); } v.use()` 로 변환.

**검출**:
```bash
grep -nE "\.get\([^)]+\)!" src/
```

**Why**: PR #68 (plan033) — Map.has 후 get()! 단언.

**Self-check**: Map.get() 결과에 `!` 단언이 있는가?
있으면 위 패턴으로 교체.

## 5-2. `as unknown as T` 이중 단언

**증상**: `expr as unknown as T` 이중 단언이 등장.
두 타입 사이의 구조적 관계가 불명확하다는 신호 — 타입 설계 재검토 필요.

**Good**: `src/api/types.ts` 에 `extends` / 타입 별칭으로 두 타입의 관계를 명시.
이중 단언은 타입 설계 재검토 신호로 처리.

**검출**:
```bash
grep -nE "as unknown as " src/
```

**Why**: PR #64 (plan031) — 두 타입 관계를 이중 단언으로 우회.

**Self-check**: `as unknown as T` 가 등장하면 타입 구조적 관계를 types.ts 에 명시했는가?

# 6. API/HTTP 패턴

## 6-1. redirect manual + status code 분기 누락

**증상**: `redirect: "manual"` + `throwHttpErrors: false` 패턴에서 `location` 헤더만 체크하고 `if (response.status === 307)` 분기가 없음.
200 OK 직접 응답 시 에러 경로로 진입.

**Good**: `if (response.status === 307)` 분기 명시.
redirect 응답과 직접 응답을 status code 로 구분.

**검출**:
```bash
grep -nE "redirect.*manual|throwHttpErrors.*false" src/api/client.ts
# 그 위치에서 status === 307 분기 존재 확인
```

**Why**: PR #72 (plan035) ADR-029 / ADR-015 연관.

**Self-check**: `redirect: "manual"` 패턴이 있으면 status 분기도 함께 있는가?

---

## 회고 절차 (build-with-teams 9단계)

PR 생성 후 team-lead 자문:
- code-reviewer 가 이번 plan 에서 FIX_NEEDED 또는 코멘트로 지적한 항목이 있는가?
- 있으면, 그 패턴이 **다른 plan 에서도 발생할 가능성** 이 있는가? (1회성 typo 제외)
- 가능성 있으면, 본 docs 의 해당 카테고리에 항목 추가 (또는 새 카테고리 신설). 1줄 단서 + 검출 명령 + Self-check 까지 채워야 추가.

회고에서 발견된 패턴은 **다음 plan 의 phase 작성 시 critic 평가 전에 소진** 됨 (planning SKILL 8단계 self-check + build-with-teams critic 평가 7번 게이트가 본 docs 도 참조).
