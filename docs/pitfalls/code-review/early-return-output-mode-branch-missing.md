---
id: early-return-output-mode-branch-missing
category: code-review
title: 조기 반환 (early return) 에서 출력 모드 분기 누락
triggers: [early return, --json, --quiet, download-all]
tool_catchable: false
source: [code-review 7-2, plan040]
related: []
---

**패턴**: `download-all` 류 명령에서 "파일 0개" 조기 반환 시 `--json` 분기만 추가하고 `--quiet` 분기를 누락.
결과: `--quiet` 사용 시 "첨부파일이 없습니다." plain text 가 stdout 에 출력 → 자동화 스크립트 parse 깨짐.

**검출**:
```bash
# early return 분기에서 json 만 체크하고 quiet 누락 탐지
grep -B2 -A5 "return;" src/commands/**/file/*.ts src/commands/**/page-file/*.ts | grep -A5 "globalOpts.json" | grep -v "globalOpts.quiet"
```

**Self-check**: 조기 반환 블록에 `globalOpts.json` 이 있으면 `globalOpts.quiet` 도 반드시 동반 확인.

**Why**: plan040 code-reviewer FIX_NEEDED — download-all 빈 파일 시 `--quiet` 에도 plain text 출력. 양 명령군 동일 사고.
