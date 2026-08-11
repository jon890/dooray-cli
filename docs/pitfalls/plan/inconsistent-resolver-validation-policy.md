---
id: inconsistent-resolver-validation-policy
category: plan
title: resolver 의 검증 정책 일관성 — 신규 검증 helper 가 기존 정책 일부만 포함
triggers: [resolver, validateMandatoryCoverage, resolveTags, selectOne, 검증 정책]
tool_catchable: false
source: [1-15, PR #68, plan033]
related: []
---

**증상**: 기존 `resolveTags` 가 mandatory와 selectOne 둘 다 검증.
  새 helper `validateMandatoryCoverage` 추가 시 이름이 "Mandatory" 라 mandatory 만 검증하고 selectOne 누락.
  post create 는 정책 모두 검사하는데 post edit (신규 helper) 는 mandatory 만 → 정책 비대칭.

**Good**: 같은 도메인의 신규 검증 helper 추가 시:
- reference function (resolveTags, resolveUsers 등) 의 검증 블록을 grep 으로 모두 인용
- 새 helper 가 어떤 정책을 포함/제외하는지 plan 본문에 명시
- 이름이 한 정책만 가리켜도 실제 검증은 reference 와 일치해야 일관성 유지

```bash
# resolver 의 검증 블록 grep — phase 본문 작성 시 reference function 참조
grep -nE "selectOne|mandatory|MandatoryGroups|SelectOneGroups" src/resolvers/tag.ts
# 신규 helper 가 위 정책 중 어느 것을 포함하는지 plan 본문에 명시
```

**Why**: PR #68 (plan033) code-reviewer MEDIUM — `validateMandatoryCoverage` 가 mandatory 만 검증, selectOne 누락.
  `resolveTags` 는 둘 다 검증이라 post create 와 post edit 의 정책 비대칭.
  다른 helper 분리 시 (예: `validateUsersCoverage`, `validateWorkflowChange` 등) 동일 패턴 재발 가능.
