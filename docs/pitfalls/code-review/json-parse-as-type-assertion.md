---
id: json-parse-as-type-assertion
category: code-review
title: "JSON.parse 결과를 `as Type` 단언"
triggers: [JSON.parse, as Type, 타입 가드, 런타임 검증]
tool_catchable: false
source: [CLI5, PR #36]
related: [double-assertion-union-bypass, test-fixture-as-never-bypass]
---

**증상**: 디스크/네트워크에서 읽은 JSON 을 검증 없이 `as LastRun` / `as CachedMember` 등 단언. 타입 시스템은 통과하지만 런타임 형태가 다르면 후속 호출에서 `TypeError: x.y is not a function`.
**Good**: 검증 로직을 **타입 가드 함수** (`function isLastRun(o: unknown): o is LastRun`) 로 추출하고 `isLastRun(parsed) ? parsed : null` 패턴 사용. 인터페이스 필드 추가 시 가드 함수도 같이 갱신해야 컴파일 통과 — 동기화 강제.
**검출**: `grep -rnE 'JSON\.parse.*\)\s+as\b' src/` (즉시 단언 패턴).
**Why**: PR #36 review — 이전에 인라인 검증 + `as` 단언은 검증 블록과 캐스트가 따로 진화하다 결국 어긋남.
