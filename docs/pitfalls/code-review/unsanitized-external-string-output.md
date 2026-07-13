---
id: unsanitized-external-string-output
category: code-review
title: 외부에서 받은 문자열을 sanitize 없이 stderr/stdout 출력
triggers: [ANSI escape, control char, sanitizeFileName, terminal 변조]
tool_catchable: false
source: [CLI10, PR #43]
related: []
---

**증상**: 서버 응답·사용자 입력에서 받은 문자열 (파일명, 멤버 displayName, 에러 메시지 등) 을 그대로 `process.stderr.write` / `process.stdout.write` 로 출력.
악의적 측이 ANSI escape 시퀀스나 control char (`\x00-\x1F`, `\x7F`) 를 삽입하면 터미널 색상·커서·title 변조 가능.
**Good**: 출력 직전 `name.replace(/[\x00-\x1F\x7F]/g, "?")` 로 제거. 공통 helper (`sanitizeFileName` / `sanitizeForTerminal`) 로 추출하여 신규 출력 지점에서도 재사용.
**검출**: `grep -nE "(stderr|stdout)\.write\(.*\$\{[a-zA-Z]+\.(name|content|title|message)" src/` — sanitize 안 거친 동적 출력 의심 패턴.
**Why**: PR #43 review — `guardDroppedAttachments` 가 서버 `file.name` 을 그대로 stderr 출력 → 악의적 파일명에 ANSI escape 시 터미널 변조. dooray API 는 사용자 업로드 파일명을 그대로 echo 하므로 sanitize 가 boundary 책임.
