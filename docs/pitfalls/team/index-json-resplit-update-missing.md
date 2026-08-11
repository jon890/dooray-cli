---
id: index-json-resplit-update-missing
category: team
title: task 재분할 시 index.json 갱신 누락
triggers: [index.json, total_phases, phases 배열, REVISE 재분할]
tool_catchable: true
source: [2-8]
related: []
---

**증상**: critic REVISE 후 phase 파일 재작성 / 추가 / 제거 시 `index.json.total_phases` 와 `phases` 배열 미갱신.
**왜**: 파이프라인이 신 phase 인식 못 해 executor 가 구 phase 만 실행 → plan 핵심 누락.

```bash
jq -r '.total_phases as $t | .phases | length as $p | "total=\($t), len=\($p)"' tasks/{plan}/index.json
ls tasks/{plan}/phase-*.md | wc -l   # 위 두 값과 일치
```

phase 파일과 index.json 은 같은 commit 으로 갱신.
