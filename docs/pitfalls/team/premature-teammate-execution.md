---
id: premature-teammate-execution
category: team
title: 팀원 자발적 실행
triggers: [자발 실행, idle 대기, critic 점검, 시작 지시]
tool_catchable: false
source: [2-2]
related: [executor-not-waiting-for-critic]
---

**증상**: idle 대기 지시 무시하고 team-lead 의 SendMessage 전에 자발 실행 / 검증 시작.
**왜**: critic 점검 시점 정합성 망가짐.

스폰 프롬프트에:
```
team-lead 의 명시적 "시작" 지시 전 절대 자발 실행 금지. idle 유지.
```

team-lead 는 critic 평가 중 worktree git status 점검으로 자발 실행 조기 감지.
