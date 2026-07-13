---
id: spinner-before-validation
category: code-review
title: validation 전에 spinner 시작 (param 에러 시 spinner leak)
triggers: [startSpinner, resolve*Input, spinner 순서, param 검증]
tool_catchable: false
source: [code-review 1-1, PR #47, plan025]
related: []
---

**증상**: `startSpinner(...)` 가 `resolve*Input(...)` / param 검증 **앞** 에 있음. 파라미터 오류 발생 시 spinner 가 떠 있는 채 stderr 에 에러 메시지가 흘러 ora 애니메이션 문자와 섞임.
**Good**: 헬퍼 호출 (`resolveCommentFileInput` / `resolvePostInput` 등) 을 spinner 보다 앞에 두고, 같은 명령군 내 일관성 유지.

```bash
# 같은 명령군 내 spinner ↔ 헬퍼 순서 일관성 검증
for f in src/commands/<scope>/*.ts; do
  echo "--- $f ---"
  awk '/\.action\(async/,/^  \}\)\;/' "$f" | \
    grep -nE "(startSpinner|resolve[A-Z][A-Za-z]*Input)" | head -5
done
```

**Why**: plan025 PR #47 — `comment/file/list.ts` 만 4 명령 중 spinner 가 헬퍼 앞에 있어 회귀.
