---
id: interactive-warning-vs-actual-behavior-mismatch
category: code-review
title: interactive 경고 vs 실제 동작 mismatch
triggers: [무시됩니다, ignored, nonInteractive, 경고 텍스트]
tool_catchable: false
source: [code-review 4-1, PR #55, plan028]
related: []
---

**증상**: interactive 분기에서 "옵션 X 는 무시됩니다" 경고를 추가했으나 실제로 옵션 resolve 로직이 interactive 경로에도 적용됨.
경고 텍스트와 코드 경로가 정반대.

**Good**: 경고 텍스트 추가 시 해당 옵션의 resolve/merge 로직이 `nonInteractive` 조건 안에만 있는지 grep 으로 확인.

**검출**:
```bash
grep -B 3 -A 10 "무시됩니다\|ignored" src/commands/
# 같은 옵션 grep 으로 nonInteractive 조건 외에서 사용되는지 확인
```

**Why**: PR #55 (plan028) 🔴 — cc/to 옵션 경고와 실제 동작 불일치.

**Self-check**: 경고 문구와 실제 코드 경로가 일치하는가?
경고 옵션 이름이 `nonInteractive` 조건 안에만 있는지 grep 으로 확인했는가?
