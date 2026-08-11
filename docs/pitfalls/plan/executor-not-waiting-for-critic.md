---
id: executor-not-waiting-for-critic
category: plan
title: executor 가 critic 평가 결과 대기 안 하고 자체 구현 진행
triggers: [critic 대기, REVISE, executor 자체 진행, 1 cycle 낭비]
tool_catchable: false
source: [1-16, PR #64, PR #67, PR #68, plan031, plan032, plan033]
related: []
---

**증상**: build-with-teams 5단계 critic 평가 (APPROVE/REVISE) → 6단계 executor 실행.
  그런데 executor 가 5단계 critic 회신을 받기 전에 plan 본문만 보고 자체 구현 시작.
  critic REVISE 가 도착해도 이미 옛 plan 본문 기준으로 코드를 작성해 사용자 결정 반영 안 됨 (이름·시그니처 임의).
  team-lead 가 reset 후 재투입 필요 → 1 cycle 낭비.

**Good**: executor 프롬프트에 "team-lead 의 phase 시작 SendMessage 받기 전에는 자체 진행 금지 — critic REVISE 가능성 있음" 명시.
  team-lead 도 executor 스폰 시점에 "대기 상태로 시작, SendMessage 까지 작업 시작 금지" 강조.
  또 plan 본문 v1 → v2 차이가 있을 때 SendMessage 메시지에 "이전 자체 진행 결과는 reset 됨, plan 본문 v2 강제" 명시.

**Why**: PR #64 (plan031) / PR #67 (plan032) / PR #68 (plan033) 3회 연속 발생.
  plan031 때는 executor 가 알아서 critic 발견 패턴 회피했지만, plan032/033 에서는 사용자 결정 옵션 a 와 다른 옵션 b 변형으로 진행 → reset 후 재투입.
  매 plan 마다 1 cycle 낭비.
  critic 평가가 비동기로 도착하는 점이 근본 원인.
  executor 가 "대기" 명시받지 않으면 자체 진행 본능적 경향.
