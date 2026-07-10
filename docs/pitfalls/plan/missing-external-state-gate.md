---
id: missing-external-state-gate
category: plan
title: 외부 상태 gate 부재
triggers: [push, merge, PR comment, npm publish, gate, rollback]
tool_catchable: false
source: [1-6]
related: []
---

**증상**: 외부 시스템 변경 (push, merge, PR comment, npm publish) 단계 앞에 상태 확인 명령 없음.
**왜**: PR 이 close / merge 됐는데 force-push 하거나 CI 실패 모르고 "검증 완료" 댓글. dooray-cli 는 `npm publish` 가 추가 외부 동작.

```bash
STATE=$(gh pr view {N} --json state -q .state)
[ "$STATE" = "OPEN" ] || { echo "PR is $STATE"; exit 1; }
```

**Self-check**: 외부 가시 동작 앞에 gate, 뒤에 rollback 절차?
