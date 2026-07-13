---
id: duplicated-map-block-missing-helper-extraction
category: code-review
title: 동일 변환 `.map` 블록이 N 파일에 복붙 → critic / planner 단계에서 헬퍼 추출 누락
triggers: [helper 추출, 복붙, critic sub-pattern, resolvers]
tool_catchable: false
source: [CLI16, PR #44]
related: []
---

**증상**: 같은 입력 (`linkInputs: string[]`) 을 같은 외부 호출 시퀀스 (`parseLinkRef → resolvePostInput → getPost → 변환`) 로 변환하는 15 줄 블록이 4 명령 파일에 그대로 복사됨.
critic 이 sub-pattern 으로 지적했으나 "executor 재량" 으로 흡수 안 함 → code-reviewer 가 다시 지적 → 사후 별도 PR review-fix 로 추출.
**Good**: phase 작성 시 "동일 변환 N 파일 복붙" 이 보이면 plan 본문에 helper 명시 (`src/resolvers/<domain>.ts` 신규). critic 의 sub-pattern 도 MAJOR 로 승격할지 판단 — 4 파일 이상 복붙은 사후 review-fix 보다 phase 안에서 추출하는 게 cheaper.
**검출**: `git diff --name-only` 결과의 `commands/post/*.ts` 가 3 개 이상이고 각 diff 의 +라인 패턴이 `for/map(... await ...)` 형태로 유사하면 추출 후보.
**Why**: PR #44 review — phase-02 plan 이 인라인 `linkInputs.map` 을 4 파일에 명시 → 적용 후 review 에서 헬퍼 추출 요구.
critic minor 1번에서도 "split 검증 부족" 같은 sub-pattern 을 지적했으나 본 패턴 (4 복붙 자체) 은 미지적.
critic prompt 에 "동일 .map N 복붙" 검출을 명시 필요.
