---
id: bare-await-never-return-ts2366
category: code-review
title: "`await fn()` 에서 `fn(): Promise<never>` 라도 catch 블록이 never-path 로 추론 안 됨 (TS2366)"
triggers: [TS2366, Promise<never>, bare await, return await]
tool_catchable: true
source: [code-review 2-1, PR #48, plan026]
related: []
---

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
