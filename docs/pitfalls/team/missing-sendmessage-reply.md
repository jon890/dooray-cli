---
id: missing-sendmessage-reply
category: team
title: 팀원 SendMessage 회신 누락
triggers: [SendMessage, 회신 누락, idle 알림, team-lead inbox]
tool_catchable: false
source: [2-1]
related: []
---

**증상**: sub-agent 가 평가 결론을 자기 화면에만 출력하고 종료. team-lead inbox 미도달.
**왜**: idle 알림만 도착 → team-lead 평가 미수신 상태로 다음 단계 진행 불가.

스폰 프롬프트 + 작업 지시 메시지 양쪽에:
```
회신은 반드시 SendMessage 로 team-lead 에 송신.
화면 텍스트만 출력하고 종료 시 라우팅 안 됨.
```

team-lead 가 idle 알림 2회 연속 + 평가 메시지 0 → 즉시 강제 재요청.
