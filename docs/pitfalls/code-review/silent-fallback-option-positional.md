---
id: silent-fallback-option-positional
category: code-review
title: "ADR-020 분기에서 silent fallback (`opts.X ?? positional`)"
triggers: [nullish coalescing, ADR-020, 모호한 입력, EXIT_PARAM_ERROR]
tool_catchable: false
source: [CLI17, PR #46]
related: []
---

**증상**: positional 인자와 옵션이 같은 값 (예: `arg3` = 댓글 ID, `--comment-id` = 댓글 ID) 을 받을 때 `opts.commentId ?? arg3` 처럼 nullish coalescing 으로 옵션 우선 처리.
깔끔해 보이지만 두 입력이 동시에 들어오면 한쪽이 silent 하게 무시되어 사용자 의도 모호.
**Good**: ADR-020 의 *"모호한 입력 = 명시적 에러"* 정책 — `if (arg3 && opts.commentId) throw DoorayCliError(EXIT_PARAM_ERROR)` 후 어느 쪽이든 단독 사용. `parseGetArgs` / `parseCommentFilePositional` 등 분기 헬퍼에 동일 가드.
**검출**: `grep -rnE 'opts\.[a-zA-Z]+\s*\?\?\s*arg[0-9]' src/commands/` (옵션 우선 fallback 패턴).
**Why**: PR #46 review — `comment/get.ts` 의 `parseGetArgs` 가 `opts.commentId ?? arg3` 로 옵션 우선.
사용자가 `dooray post comment get myproject 337 id-A --comment-id id-B` 입력하면 `id-A` 가 silent 무시.
ADR-020 의 분기 점검은 모호한 입력을 거부해야 함.
