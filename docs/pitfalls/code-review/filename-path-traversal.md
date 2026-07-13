---
id: filename-path-traversal
category: code-review
title: 외부 응답의 fileName 으로 경로 조립 (path traversal)
triggers: [path traversal, basename, fileName, download]
tool_catchable: false
source: [CLI7, PR #40, PR #72]
related: []
---

**증상**: 서버 / API 가 반환한 `fileName` 을 검증 없이 `path.join(outDir, fileName)` 에 사용. 악의적 (또는 버그있는) 서버가 `../../etc/passwd` 같은 값을 반환하면 지정 디렉토리 밖으로 파일이 기록됨.
**Good**: 외부에서 받은 fileName 은 항상 `basename(fileName)` 으로 directory component 제거 후 join. 다운로드 / 첨부 / 사용자가 통제하지 않는 모든 경로 입력에 적용.
**검출**: `grep -rnE 'join\([^)]*\bfileName\b' src/commands/` 중 `basename` 미적용 라인.
**Why**: PR #40 review — `post comment file download` 가 Dooray 응답의 fileName 을 그대로 join. 보안 측면에서 1줄로 막을 수 있는 취약점.
**재발 빈도 높음**: PR #40 (🔴) → PR #72 (🔴) 두 PR 에서 동일 버그가 반복됨.
download 명령 신설 시 `basename(decodeURIComponent(fileName))` grep 강제.
