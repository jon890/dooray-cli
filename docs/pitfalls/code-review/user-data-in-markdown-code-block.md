---
id: user-data-in-markdown-code-block
category: code-review
title: 사용자 데이터를 markdown 코드 블록에 직접 삽입
triggers: [fenced code block, markdown 이스케이프, issue body, feedback-meta]
tool_catchable: false
source: [CLI6, PR #36]
related: []
---

**증상**: `` `\`\`\`\n${last.errorMessage}\n\`\`\`` `` 처럼 외부에서 받은 문자열을 fenced code block 안에 그대로 삽입. 데이터에 `` ``` `` 가 포함되면 GitHub Markdown 파서가 거기서 코드 블록을 닫아 본문이 깨짐 (누출 가능).
**Good**: 삽입 전 `` s.replace(/```/g, "'''") `` 로 이스케이프하거나, 인용 블록 (`>`) 으로 감싸기. issue body / PR body / wiki 모두 동일.
**검출**: `grep -rnE '"\`\`\`"' src/utils/feedback-meta.ts src/` 영역의 fenced block builder 코드.
**Why**: PR #36 review — `buildLastRunBlock` 가 errorMessage 를 코드 블록 안에 직접 넣어 GitHub 표시가 깨질 가능성.
