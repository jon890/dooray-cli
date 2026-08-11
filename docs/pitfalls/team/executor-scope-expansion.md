---
id: executor-scope-expansion
category: team
title: executor scope 확장 자체 판단
triggers: [scope 확장, ts-ignore, ts-expect-error, task 범위 외]
tool_catchable: false
source: [2-5]
related: []
---

**증상**: phase 도중 task 범위 외 (pre-existing 에러 / 발견한 bug / ADR 위반 자체 변경) 를 자체 추가.
또는 `@ts-ignore` / `@ts-expect-error` 자체 추가.
**왜**: critic 게이트 우회 → 사후 평가 사이클 추가, task 본문 / 성공 기준 어긋남.

executor 프롬프트에:
```
task 범위 외 수정은 자체 판단 금지.
@ts-ignore / @ts-nocheck / @ts-expect-error 자체 추가 = 정책 변경 → 보고 필수.
SendMessage 로 team-lead 에 보고: "X 발견, Y 수정 필요. 본 phase 포함 / 별도 plan 결정 부탁".
```

team-lead 흐름: 보고 → critic 사후 평가 → ACCEPT (scope 확장 commit 명시) 또는 REJECT (별도 plan).
