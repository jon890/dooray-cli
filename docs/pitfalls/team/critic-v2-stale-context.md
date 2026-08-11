---
id: critic-v2-stale-context
category: team
title: critic v2 재평가 시 신 파일 미재읽기
triggers: [critic 재평가, REVISE, v2 commit, Read tool]
tool_catchable: false
source: [2-6]
related: []
---

**증상**: REVISE 후 v2 commit hash 받고도 v1 평가 그대로 반복 송신.
**왜**: critic 이 이전 평가 컨텍스트만 가지고 회신 → 신 파일 Read 누락.

team-lead 재평가 메시지에 **3가지 필수 포함**:
1. `Read tool 로 다음 파일을 다시 읽고 재평가해 줘` 명시와 변경 파일 절대경로
2. 4-5개 확인 포인트 체크리스트
3. "직전 메시지가 첫 평가 사본일 수 있음 — 실제 파일 상태 기준으로 판정"

회신이 v1 동일하면 즉시 강제 재읽기.
