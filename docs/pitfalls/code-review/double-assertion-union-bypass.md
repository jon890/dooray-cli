---
id: double-assertion-union-bypass
category: code-review
title: "`as unknown as X | Y` 이중 단언 — API client 반환 타입 union 으로 우회"
triggers: [as unknown as, 이중 단언, union 타입, API client 반환 타입]
tool_catchable: false
source: [CLI24, PR #77]
related: [json-parse-as-type-assertion, test-fixture-as-never-bypass, type-double-assertion-bypass]
---

**증상**: API client 의 메소드 반환 타입이 spec 과 실제 응답 shape 다를 때 (예: Dooray `result` 가 nested array) resolver 단에서 `(res.result as unknown as MemberGroup[][] | MemberGroup[]).flat()` 같이 이중 단언 사용.
TypeScript 의 구조적 호환성 검사가 우회되어 다른 shape mismatch 가 silent 통과할 위험.
**Good**: `MemberGroupListResponse.result: MemberGroup[] | MemberGroup[][]` 처럼 **반환 타입 자체를 union 으로 선언**, resolver 에서 `res.result.flat()` 단언 없이 호출. `Array.prototype.flat()` 시그니처가 union 양쪽 case 자동 흡수.
**검출**: 신규 resolver / parser 추가 시:
```bash
grep -nE "as unknown as .*\|" src/
# 결과 있으면 의심 — API client 반환 타입 union 으로 옮길 수 있는지 검토
```
**Why**: PR #77 review — `member-group.ts:21` 이중 단언으로 ADR-028 nested array unwrap 구현.
리뷰 권장에 따라 `MemberGroupListResponse.result` union 으로 옮기고 단언 제거 (PR #77 commit `76105b5`).
같은 패턴이 향후 spec ↔ runtime mismatch 흡수 (ADR-028 류) 에 재발 가능 — API client 단에서 union 으로 흡수하는 게 type-safety 측면에서 우선.
