---
id: missing-optional-relaxation-cascade-grep
category: plan
title: type optional 완화 시 cascade 파일 grep 누락
triggers: [optional, cascade, MemberGroup.code, TS2322, type narrowing]
tool_catchable: true
source: [1-12, PR #67, plan032]
related: [filter-type-narrowing-gap]
---

**증상**: 기존 type 의 필드 `code: string` → `code?: string` 같은 optional 완화 / undefined 가능 변경을 plan 본문에 한 번 명시.
  그러나 해당 필드를 *사용하는* 다른 파일 (`commands/project/groups.ts` 의 `[g.id, g.code]` 같은 `string[][]` 단언) 에서 type narrowing 실패 → tsc 실패.
  plan 본문 `## 변경 파일` 섹션에 그 cascade 파일이 누락.

**Good**: type 변경 (특히 optional 완화 / 새 필드 추가 / 필드 제거) 을 plan 에 넣을 때 `grep -rn "\.{필드명}\b" src/` 로 모든 사용처 grep, `## 변경 파일` 에 추가.
  type narrowing 손실 가능성 (배열 element type, .map 결과 type, return type 추론 등) 도 같이 점검.

```bash
# plan 작성 시 (또는 critic 평가 시) 검증:
# 예: MemberGroup.code 를 optional 로 완화
grep -rn "\.code\b" src/ | grep -v "test\|\.md$"   # 사용처 전수 조사
grep -rn "MemberGroup\|CachedMemberGroup" src/    # type 참조 전수 조사
# 결과 파일들이 plan 의 `## 변경 파일` 에 모두 있는지 확인
```

**Why**: PR #67 (plan032) critic Major #1 — `MemberGroup.code: string → string | undefined` 완화로 `groups.ts:24` `[g.id, g.code]` 가 `(string | undefined)[][]` 가 되어 TS2322.
  plan 본문에 `groups.ts` 누락.
  executor 가 자체 `g.code ?? ""` 패치로 회피했지만 plan-only 실행이면 tsc 실패.
  다른 resolver 의 type 완화 작업 시 동일 패턴 재발 가능.
