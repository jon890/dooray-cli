---
id: resolver-before-editor
category: code-review
title: resolver 를 body 수집·editor open 보다 뒤에 호출 (resolver-before-editor)
triggers: [resolveWikiPageInput, resolvePostInput, openInEditor, readBodyInputOrNull]
tool_catchable: false
source: [code-review 1-3, PR #74, PR #64]
related: []
---

**증상**: `resolveWikiPageInput` / `resolvePostInput` 같은 resolver 호출이 `readBodyInputOrNull` / `openInEditor` 보다 뒤에 있음.
resolver 실패 시 사용자가 이미 에디터에 입력한 내용이 유실됨.

**Good**: resolver 를 항상 `readBodyInputOrNull` / `openInEditor` 보다 먼저 호출.
`delete.ts` / `edit.ts` 패턴이 reference.

**검출**:
```bash
grep -B 5 "openInEditor\|readBodyInputOrNull" src/commands/ | grep -B 5 -A 1 "resolve[A-Z][A-Za-z]*Input"
# resolver 호출이 뒤에 있으면 의심
```

**Why**: PR #74 (plan036) 와 PR #64 (plan031) 2회 반복.
add 명령군에서 특히 발생.

**Self-check**: add / edit 명령 작성 시 resolver 호출 순서가 body 수집보다 앞인지 grep 으로 확인했는가?
