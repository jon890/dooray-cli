---
id: sequential-endpoint-partial-failure-missing
category: code-review
title: sequential endpoint 호출 — partial-failure stderr 안내, spinner pair 누락
triggers: [sequential 호출, partial-failure, stopSpinner, re-throw]
tool_catchable: false
source: [CLI23, PR #62]
related: []
---

**증상**: 본문 변경(`updatePost`), 메타데이터 변경(`setPostParent` / `setPostWorkflow` / `deletePostFile`, `updatePost` 댓글 PUT 합성 등) 을 sequential 로 호출.
atomic 보장 없으므로 첫 호출 성공, 두 번째 실패 시 부분 상태 발생.
catch 가 `toDoorayCliError` 로 throw 만 하면 사용자는 "전체 실패" 로 오해 → 본문 재실행으로 mention prepend 중복 등 부작용.
**Good**: sequential 호출의 catch 안에서
1. `stopSpinner(false, "...")`
2. `process.stderr.write("⚠  본문은 수정되었으나 X 변경에 실패했습니다. 본문 재실행 금지 — ...")`
3. re-throw.

phase 본문 작업 항목에 try/catch, stderr 안내 코드 스니펫 명시.
**검출**: phase diff 에 `client.X`, `client.Y` 두 호출이 같은 비-Promise.all 블록에 있으면 의심. grep 패턴:
```bash
git diff main..HEAD -- src/commands/ | grep -E "^\+\s+await client\." | wc -l
# 같은 함수에서 2 이상이면 sequential 패턴 — partial-failure 처리 확인
```
**Why**: PR #62 critic REVISE — `updatePost` 성공 후 `setPostParent` 실패 시 본문은 저장된 상태.
사용자가 명령 재실행하면 mention prepend 중복 / link-task 중복 추가 가능.
ADR-019 (post create --workflow), ADR-024 (comment file delete) 도 동일 패턴 — sequential 추가 시 반드시 partial-failure UX 점검.
