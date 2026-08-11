---
id: adjacent-command-defensive-pattern-missing
category: code-review
title: 같은 도메인 인접 명령의 defensive 패턴 동일 적용 누락
triggers: [buildMemberNameMap, try-catch, enrich, 인접 명령]
tool_catchable: false
source: [CLI18, PR #46]
related: []
---

**증상**: `comment/list.ts` 가 `buildMemberNameMap` 호출을 try-catch와 빈 `Map` fallback 으로 감싸 멤버 조회 실패 시에도 댓글 목록은 그대로 반환. `comment/get.ts` 가 신설되면서 동일 패턴 누락 → 멤버 API 실패 시 단건 댓글 조회 자체가 실패.
**Good**: 같은 도메인 (`commands/post/comment/`) 신규 명령 작성 시 인접 파일 (`list.ts`, `add.ts` 등) 의 enrich / cleanup / dry-run / 출력 분기 패턴을 grep 으로 먼저 확인하고 그대로 적용. 일관성이 회귀 방어선.
**검출**: phase 작성 / review 시 `grep -nE "try\s*\{|catch\s*\(|new Map" src/commands/post/comment/*.ts` 결과를 신규 명령과 인접 명령 사이 diff. 인접 명령에 있는 가드가 신규 명령에 없으면 의도적인지 확인.
**Why**: PR #46 review — `comment/get.ts` 가 `buildMemberNameMap` 을 raw 호출.
critic / docs-verifier 모두 잡지 못했고 code-reviewer 가 PR review 단계에서 발견.
plan 작성 시 *"인접 명령 동일 패턴 적용 점검"* 을 self-check 에 포함하면 사전 차단 가능.
