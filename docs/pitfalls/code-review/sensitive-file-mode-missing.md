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
`mode` 는 파일을 새로 만들 때만 적용된다. 이미 0o644 로 있는 파일에 `writeFile` 로 덮어쓰면 권한이 그대로 남는다.
그래서 tmp 파일에 `mode: 0o600` 으로 쓰고 `rename` 으로 교체한다. `rename` 은 대상 자리에 tmp 의 inode 를 두므로 기존 파일의 권한도 바뀐다.
tmp 이름은 `${path}.${process.pid}.${randomUUID()}.tmp` 로 고유하게 짓고 `flag: "wx"` 로 연다. 고정 이름이면 동시에 저장하는 프로세스끼리 tmp 를 덮어쓰고, 남아 있던 tmp 에는 `mode` 가 적용되지 않는다.
rename 이 실패하면 tmp 를 지운다.
`~/.dooray` 디렉터리는 `mkdir(..., { recursive: true, mode: 0o700 })` 으로 만들고, 이미 있던 디렉터리에는 mode 가 적용되지 않으니 `chmod(dir, 0o700)` 을 한 번 시도한다. 실패는 무시한다(Windows).
`src/config/store.ts` 의 `ensureDir` 와 `writeConfigFile` 이 이 형태다.
**검출**: `grep -nE 'writeFile\([^,]+,\s*[^,]+\)' src/cache/ src/config/ | grep -v "mode:"` (옵션 인자가 없는 호출). 기존 파일을 덮어쓰는 호출은 `mode:` 가 있어도 rename 을 거치는지 본다.
**Why**: PR #36 review — last-run.json 이 sanitized 후에도 argv 에 프로젝트 코드 / 19자리 ID 가 남아 있어 정보 노출 표면.
