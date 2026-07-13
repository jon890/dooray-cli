---
id: dry-run-scenario-missing-noninteractive-trigger
category: code-review
title: dry-run 실증 시나리오에서 non-interactive 진입 조건 누락
triggers: [dry-run, nonInteractive, 실증 시나리오, --title]
tool_catchable: false
source: [CLI22, PR #62]
related: []
---

**증상**: phase 본문 실증 시나리오에 `--dry-run --json` 만 명시 (예: `node dist/index.js post edit <project> <number> --parent <ref> --dry-run --json`).
그런데 `post edit` 의 분기는 `nonInteractive = !!(title || body || bodyFile)` — `--dry-run` 자체는 non-interactive 진입 조건이 아니라서 interactive ($EDITOR) 분기로 빠짐.
dry-run JSON 출력 블록은 non-interactive 안에만 존재 → 실증 시나리오가 통과 불가능.
**Good**: post edit/comment edit 류의 실증 시나리오에 `--dry-run` 을 쓰려면 항상 `--title "<원제목>"` 또는 `--body "..."` 동반. phase 본문 실증 단계에 "non-interactive 진입 보장을 위해 `--title` 동반 필수" 한 줄 명시.
**검출**:
```bash
grep -nE "\-\-dry-run" tasks/{plan}/phase-*.md | grep -vE "\-\-title|\-\-body"
# 결과 있으면 의심
```
**Why**: PR #62 critic REVISE — phase-01 실증 시나리오 #5 가 `--parent --dry-run --json` 만 명시.
실제 코드에서 interactive 분기로 진입해 dry-run JSON 자체가 실행 안 됨.
executor 가 "통과한 것처럼" 보고하거나 디버깅 미궁 위험.
comment edit / post edit / wiki page edit 동일 패턴.
