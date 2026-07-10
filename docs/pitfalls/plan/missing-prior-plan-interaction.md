---
id: missing-prior-plan-interaction
category: plan
title: 이전 plan / main 커밋과의 상호작용 누락
triggers: [이전 plan, main 커밋, rebase, final state]
tool_catchable: false
source: [1-3]
related: []
---

**증상**: 이번 plan 이 다른 최근 plan 산출물과 충돌하는데 본문에 그 관계 미서술.
**왜**: executor 가 rebase 중 "어느 쪽이 final state 인가" 모르고 잘못된 방향으로 병합.

```bash
git log origin/main --oneline -20 -- <scope-dir>/
ls -dt tasks/*/ | head -5
```

**Self-check**: 최근 10개 커밋 중 plan 범위 파일을 건드린 게 있는가? 있으면 "어느 쪽이 final" 명시?
