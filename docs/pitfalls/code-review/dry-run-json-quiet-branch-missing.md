---
id: dry-run-json-quiet-branch-missing
category: code-review
title: "`--dry-run` / 출력 분기에서 `--json` / `--quiet` 모드 누락"
triggers: [dry-run, --json, --quiet, writeBodyOutput]
tool_catchable: false
source: [CLI13, PR #44]
related: [dry-run-branch-position-asymmetry]
---

**증상**: 같은 옵션 세트(`--json` / `--quiet` / `--dry-run`)를 받는 4 명령에서 dry-run 분기가 일부 명령에만 `globalOpts.json` 처리를 가지고, 나머지에는 `process.stdout.write(body + "\n")` 평문만.
CLI 자동화 스크립트가 같은 플래그 조합을 명령별로 다른 형식으로 받음.
**Good**: 새 출력 분기 (`if (opts.dryRun)`, "변경사항 없음" 등) 추가 시 `globalOpts.json` / `globalOpts.quiet` 분기를 같은 자리에서 처리. helper 추출 권장 (`writeBodyOutput(body, globalOpts)`).
**검출**: `grep -nE "opts\.dryRun|process\.stdout\.write" src/commands/post/` 결과를 4 명령 사이 비교 — 한 명령에만 `JSON.stringify` 가 있으면 다른 3개도 동일 분기 필요.
**Why**: PR #44 review — `comment add` / `post create` 만 dry-run JSON 분기, `comment edit` / `post edit` 누락. 같은 `OutputOptions` 인터페이스를 공유하는 명령 그룹은 출력 분기도 동일해야 한다.
