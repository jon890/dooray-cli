---
id: missing-final-phase-completion-marking
category: plan
title: 마지막 phase 에 index.json `completed` 마킹 지시 누락
triggers: [index.json, completed, current_phase, 마지막 phase]
tool_catchable: false
source: [1-8, PR #62]
related: []
---

**증상**: 마지막 phase 본문에 "index.json status 와 모든 phase status 를 `completed` 로 바꾸고 단일 commit 포함" 지시 없음.
**왜**: executor 는 scope 가드로 자체 추가 안 함 (올바른 행동) → team-lead 가 PR 직전 amend / 별도 commit.
main 직접 수정 유혹 발생.

```bash
sed -i '' 's/"status": "pending"/"status": "completed"/g' tasks/{plan}/index.json
grep -c '"status": "completed"' tasks/{plan}/index.json   # = (1 + total_phases)
grep -lE "index\.json.*completed" tasks/{plan}/phase-*.md   # 마지막 phase 파일 매칭
```

**Self-check**: 마지막 phase 에 마킹 지시와 단일 commit 포함 명시?

**`current_phase` 도 함께 갱신** (PR #62 review 추가): 위 sed 는 `status` 3건만 치환.
`index.json` 의 `current_phase` 필드는 그대로 남아 "완료지만 phase 1 진행 중" 모순 발생.
마지막 phase 본문에 다음 1줄 sed 도 명시:

```bash
sed -i '' 's/"current_phase": 1/"current_phase": 2/' tasks/{plan}/index.json
grep -cE "\"current_phase\": {total_phases}" tasks/{plan}/index.json   # = 1
```
