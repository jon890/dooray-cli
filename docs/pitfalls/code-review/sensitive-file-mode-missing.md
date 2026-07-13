---
id: sensitive-file-mode-missing
category: code-review
title: "`~/.dooray/` 민감 파일의 mode 미지정"
triggers: [writeFile mode, 0o600, last-run.json, 공유 머신]
tool_catchable: false
source: [CLI4, PR #36]
related: []
---

**증상**: `writeFile(path, data)` 만 호출하면 OS umask (보통 644) 로 파일 생성 → 공유 머신에서 다른 사용자가 sanitized argv (project code / postId 등) 또는 캐시된 멤버 정보를 읽을 수 있음.
**Good**: 사용자 데이터를 담는 `~/.dooray/` 하위 파일은 `writeFile(..., { mode: 0o600 })` 으로 owner-only. 특히 `last-run.json` / cache 하위 / config.json 등.
**검출**: `grep -nE 'writeFile\([^,]+,\s*[^,]+\)' src/cache/ src/config/ | grep -v "mode:"` (옵션 인자가 없는 호출).
**Why**: PR #36 review — last-run.json 이 sanitized 후에도 argv 에 프로젝트 코드 / 19자리 ID 가 남아 있어 정보 노출 표면.
