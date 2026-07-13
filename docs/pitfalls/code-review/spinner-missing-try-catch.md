---
id: spinner-missing-try-catch
category: code-review
title: spinner 시작 후 try/catch 없이 API 호출 → 에러 시 spinner leak
triggers: [startSpinner, stopSpinner, try/catch, spinner leak]
tool_catchable: false
source: [code-review 1-2, PR #46, PR #64]
related: []
---

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
**Why**: PR #46 — `comment/get.ts` 의 `startSpinner` 후 `resolvePostInput` / `getPostComment` 가 try 없이 호출 → 에러 경로 spinner 잔존.
1-1 과 다른 패턴 (1-1 은 호출 위치, 1-2 는 cleanup 누락).

**기존 spinner 블록에 새 헬퍼 호출 추가 / 위치 이동 시 (재발 패턴)**: spinner 블록 내부에 새 헬퍼 (`readBodyInput`, `resolveTemplate`, `getProjectTemplateDetail` 등) 호출을 추가하거나 spinner 전에 있던 호출을 spinner 후로 이동하는 경우, 그 새 위치도 동일하게 try/catch 보호가 필요하다.
spinner 전에 있을 때는 안전했던 호출 (예: `readBodyInput` 의 파일 부재 throw) 이 spinner 후 위치로 이동하면 leak 경로가 생긴다.

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
