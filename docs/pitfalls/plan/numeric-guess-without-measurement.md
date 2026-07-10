---
id: numeric-guess-without-measurement
category: plan
title: 수치 추측 (파일 수 / 줄 수)
triggers: [수치 추측, 파일 수, 줄 수, critic REVISE, 실측]
tool_catchable: false
source: [1-1]
related: []
---

**증상**: "약 30개 파일", "100줄 줄어듦" 같은 수치를 실측 없이 적음.
**왜**: critic 이 가장 먼저 검증하는 것은 phase 약속 수치 ↔ 실제 코드 일치 여부. 추측은 즉시 REVISE 사유.

```bash
git diff <base>..<target> --stat | tail -5
git diff <base>..<target> --name-only | wc -l
```

**Self-check**: 모든 수치가 실측 명령 결과? 명령 자체가 plan 에 인용되어 있는가?
