---
id: inaccurate-file-scope
category: plan
title: 파일 범위 부정확
triggers: [파일 범위, 전체 수정, scope, docs 일괄]
tool_catchable: false
source: [1-2, plan034, PR #69]
related: []
---

**증상**: "commands 전체 수정" — "전체" 표현은 critic 이 추적 불가.
**왜**: 누락된 파일이 conflict 진앙이 되면 executor 가 헤맨다.

```bash
git diff <base>..<target> --name-only -- <scope-dir>/
```

**Self-check**: 파일 목록을 plan 에 전부 나열했고, 각 파일 처리 원칙이 서술됐는가?
디렉터리 단위 정리 task (docs 일괄 backfill / lint 전 적용 등) 는 `ls <dir>/*.md` 결과를 plan 본문에 직접 인용하여 큰 파일 누락 회피.
(plan034 PR #69 — `docs/guide-mvp-with-ai-agent.md` 878줄 누락이 critic REVISE 사유)
