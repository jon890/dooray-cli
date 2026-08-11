---
id: ambiguous-execution-context
category: plan
title: 실행 컨텍스트 모호 (cwd / branch)
triggers: [cwd, branch, worktree, main repo]
tool_catchable: false
source: [1-4]
related: [executor-cwd-isolation]
---

**증상**: Bash 블록에 `cd` 없거나 "메인 디렉터리에서" 같은 애매한 서술.
**왜**: worktree 에서 main repo 로 잘못 커밋이 박히면 force-push 로 PR 에 섞임.

**규칙**: 모든 Bash 블록 위에 `# cwd: {절대경로}` 주석, 브랜치 의존 시 `# branch: {expected}`.

**Self-check**: 모든 Bash 블록이 실행 위치 명시? worktree 사용 plan 이면 main vs worktree 구분 명확?
