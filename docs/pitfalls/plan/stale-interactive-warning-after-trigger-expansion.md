---
id: stale-interactive-warning-after-trigger-expansion
category: plan
title: nonInteractive trigger 확장 시 interactive 분기의 옵션 경고 정리 누락
triggers: [nonInteractive, interactive 경고, dead code, hasTagChange]
tool_catchable: false
source: [1-14, PR #68, plan033]
related: [interactive-warning-code-mismatch]
---

**증상**: `nonInteractive` 진입 조건에 새 옵션을 추가 (`|| hasTagChange` 등).
  그러나 interactive `else` 블록에 기존에 있던 `if (hasOption) { stderr "...단독 사용 안 됨..." }` 경고를 그대로 둠.
  새 옵션이 trigger 에 포함됐으므로 else 분기에서는 절대 true 가 안 됨 → **dead code + 메시지가 사실과 반대** (단독 호출이 이번 기능의 핵심인데 "단독 호출 안 됨" 안내 출력 가능성 0이지만 의도 충돌).

**Good**: nonInteractive trigger 에 새 옵션 추가하는 phase 면 같은 phase 본문에 "interactive else 블록 안의 동일 옵션 경고 (`if (hasX)`) 제거" 를 명시. 또는 의도 주석으로 대체 ("trigger 에 포함되므로 도달 불가").

```bash
# 검출: nonInteractive 조건에 추가한 옵션이 interactive else 안에 if 로도 등장하면 dead code
grep -nE "if \(hasTagChange\)|if \(opts\.parent\)|if \(.*\.cc.*\)" src/commands/post/edit.ts
# 같은 옵션이 nonInteractive 조건 + interactive 분기 if 양쪽에 동시에 있으면 한쪽이 dead
```

**Why**: PR #68 (plan033) docs-verifier VIOLATION — `nonInteractive = ... || hasTagChange` 확장 후 interactive else 안에 `if (hasTagChange) stderr "단독 호출 안 됨"` 그대로 둠.
  도달 불가 + 메시지 정반대.
  cc/parent 같이 trigger 미포함 옵션의 경고 패턴을 그대로 적용할 때 발생.
