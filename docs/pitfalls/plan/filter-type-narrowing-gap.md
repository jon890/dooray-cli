---
id: filter-type-narrowing-gap
category: plan
title: "`.filter()` 후 TypeScript 타입 자동 미좁힘"
triggers: [filter, type predicate, narrowing, TS2345, TS2339]
tool_catchable: true
source: [1-13, PR #67, plan032]
related: [missing-optional-relaxation-cascade-grep]
---

**증상**: `arr.filter((x) => typeof x.field === "string")` 후 `arr.map((x) => ({ name: x.field }))` 작성.
  사람은 "필터 후니까 string 보장" 으로 이해하지만 TypeScript 는 filter callback 의 boolean return 으로 narrowing 안 함 → x.field 는 여전히 `string | undefined`.
  다음 사용처에서 type 불만족 (`NameRecord extends { name: string }` 위반 등) 으로 TS2345/TS2339.

**Good**: 두 가지 방법:
- **type predicate** (선호 — 안전): `.filter((x): x is X & { field: string } => typeof x.field === "string" && x.field.length > 0)` — TypeScript 가 narrowing 인지
- **`as string` 단언** (간단): `arr.map((x) => ({ name: x.field as string }))` + 단언 안전성 주석 (`// filter 로 string 보장`)

```ts
// BAD — narrowing 안 됨
const valid = groups.filter((g) => typeof g.code === "string");
const adapter = valid.map((g) => ({ name: g.code }));   // TS2345: string | undefined

// GOOD A — type predicate
const valid = groups.filter(
  (g): g is CachedMemberGroup & { code: string } =>
    typeof g.code === "string" && g.code.length > 0
);
const adapter = valid.map((g) => ({ name: g.code }));   // OK

// GOOD B — as string + 주석
const adapter = valid.map((g) => ({ name: g.code as string }));   // filter 로 string 보장
```

**검출**: type optional 완화 후 `filter` + `map` 체인이 plan 에 등장하면 narrowing 패턴 확인. 단언 사용 시 주석 필수.

**Why**: PR #67 (plan032) critic Major #3 — `member-group.ts` 의 `valid.map((g) => ({ name: g.code }))` 에서 TS2345/TS2339.
  executor 가 `as string` 추가로 회피.
  type predicate 가 더 안전하나 본 케이스는 단언 + 주석으로 처리.
  다른 resolver 의 optional 필드 filter 패턴에서 반복 가능.
