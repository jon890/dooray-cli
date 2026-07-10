---
id: test-regex-missing-dotall
category: plan
title: 테스트 정규식 — 에러 메시지 개행 시 dotAll (`s`) 플래그 필수
triggers: [toThrow, dotAll, 정규식, 개행, DoorayCliError 메시지]
tool_catchable: false
source: [1-18, plan039]
related: []
---

**증상**: `.toThrow(/패턴A.*패턴B/)` 에서 에러 메시지 중간에 `\n` 이 있으면 `.` 가 매칭 안 해서 테스트 항상 실패.

**self-check**:
```bash
# phase 테스트 코드에서 .toThrow 정규식이 멀티라인 에러 메시지를 잡는지 확인
# 에러 메시지에 \n 포함 여부: 대상 함수의 throw 구문 확인
grep -A2 'toThrow(/' tasks/*/phase-*.md | grep -v '/s)'
# /s) 없이 .* 로 멀티라인 매칭 시도하면 실패
```

**대안**: `/패턴A.*패턴B/s` — `s` (dotAll) 플래그로 `.` 가 `\n` 포함 매칭.

**Why**: plan039 critic REVISE v2 — `DoorayCliError` 메시지에 `\n` 2개 포함. dotAll 없이 `.*` 가 연결 실패해 테스트 항상 red.
