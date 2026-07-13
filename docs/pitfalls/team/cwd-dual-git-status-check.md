---
id: cwd-dual-git-status-check
category: team
title: cwd 추적 + 양쪽 git status 검증
triggers: [cwd, main repo, worktree, git status, 양쪽 점검]
tool_catchable: false
source: [2-9]
related: [executor-cwd-isolation]
---

**증상**: team-lead 가 task 재작성 / commit 시 cwd 가 main repo 인지 worktree 인지 헷갈림. 동일 상대경로가 다른 파일 가리킴.
**왜**: main repo 의 task 파일 의도치 않게 수정 / 삭제. system-reminder 알림이 어느 working tree 인지 명확히 표기 안 됨.

commit 전 `pwd` + 양쪽 동시 점검:
```bash
git -C /Users/.../dooray-cli status --short
git -C /Users/.../dooray-cli/.claude/worktrees/{plan} status --short
```
