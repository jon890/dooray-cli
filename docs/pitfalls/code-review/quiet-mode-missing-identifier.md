---
id: quiet-mode-missing-identifier
category: code-review
title: "`--quiet` 모드에서 식별자 출력 누락"
triggers: [--quiet, fileId, 파이프 체이닝, xargs]
tool_catchable: false
source: [CLI9, PR #40]
related: []
---

**증상**: 자동화 / 파이프 친화 모드 (`--quiet`) 에서 fileId / postId / pageId 같은 후속 처리에 필요한 식별자를 stdout 에 출력하지 않음. 호출자 (스킬 / shell pipe) 가 `dooray foo upload --quiet | xargs dooray bar` 패턴으로 체이닝 불가.
**Good**: `--quiet` 분기에서 사람용 메시지는 생략하되 **식별자 1 줄** (`fileId`, `pageId` 등) 은 stdout 출력. `--json` 과 별개로 quiet 도 자동화 진입점.
**검출**: `--quiet` 분기에서 `stdout.write` 가 0 줄인 명령 — 신규 명령 PR review 시 grep.
**Why**: PR #40 review — `comment file upload --quiet` 가 fileId 미출력 → 다음 명령 체이닝 불가.
