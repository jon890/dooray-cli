---
id: test-fixture-as-never-bypass
category: code-review
title: "테스트 fixture `as never` / `as any` 로 required 필드 우회"
triggers: [as never, as any, satisfies, 테스트 fixture]
tool_catchable: false
source: [CLI25, PR #91]
related: [double-assertion-union-bypass, json-parse-as-type-assertion, type-double-assertion-bypass]
---

**증상**: 도메인 객체를 만드는 테스트에서 `{ 일부필드 } as never` 로 타입 검사를 무력화 → required 필드 누락이 은폐됨.
이후 타입에 필드가 추가돼도 테스트가 조용히 통과한다 (CLI24 의 production 이중 단언과 구별되는 테스트 fixture 하위 패턴).
**Good**: `{ ...필수필드 } satisfies T` — 필드를 모두 채우고 `satisfies` 로 검증. 타입 확장 시 컴파일 오류로 드러난다.
**검출**: 신규 테스트 추가 시:
```bash
grep -rnE "as (never|any)\b" src/**/*.test.ts
# 결과 있으면 satisfies 로 대체 가능한지 검토
```
**Why**: PR #91 review — `store.test.ts` 가 `CachedMe.orgId` 누락을 `as never` 로 감춤. `satisfies CachedMe` 로 교체 (commit `01fa20e`).
