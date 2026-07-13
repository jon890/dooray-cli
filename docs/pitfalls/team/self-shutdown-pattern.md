---
id: self-shutdown-pattern
category: team
title: self-shutdown 패턴
triggers: [self-shutdown, code-reviewer, architect, docs-verifier, run_in_background]
tool_catchable: false
source: [2-3]
related: []
---

**증상**: `oh-my-claudecode:code-reviewer` / `architect` (docs-verifier) 가 `run_in_background: true` 로 스폰해도 idle 직후 자체 shutdown.
**왜**: critic 만 idle 유지 성공. reviewer / verifier 는 shutdown.

**우회**: 검사 결과 준비 시점에 즉시 새로 spawn (idle 대기 의존 금지). 죽었다는 시스템 알림 받으면 침묵 말고 새로 스폰 + 즉시 검사 지시 묶음.
