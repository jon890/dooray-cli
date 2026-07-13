---
id: executor-cwd-isolation
category: team
title: executor cwd 격리 (main repo 오염 방지)
triggers: [cwd, worktree, main repo, 오염 방지]
tool_catchable: false
source: [2-4]
related: [ambiguous-execution-context, cwd-dual-git-status-check]
---

**증상**: worktree 절대경로 명시했는데 executor 가 main repo 에서 `cd /main-repo` 로 작업.
**왜**: main 오염 → origin 다이버전스 / 다른 plan 미푸시 작업과 충돌.

executor 프롬프트에:
```
모든 cd / git / 파일 편집은 worktree 절대경로 기준만. main repo 직접 cd 금지.
의심 시 `pwd` 확인.
```

team-lead 는 executor 작업 중 `git -C {main-repo} status` 주기 점검. dirty 시 즉시 중단.
