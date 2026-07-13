---
id: map-get-non-null-assertion
category: code-review
title: "Map.has → get()! non-null assertion"
triggers: [Map.has, Map.get, non-null assertion, narrowing]
tool_catchable: false
source: [code-review 5-1, PR #68, plan033]
related: []
---

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
