---
id: missing-branch-check-before-commit
category: team
title: 브랜치 확인 누락 commit 사고
triggers: [git branch --show-current, commit 직전, PR 브랜치, main 오염]
tool_catchable: false
source: [2-10]
related: [executor-cwd-isolation, cwd-dual-git-status-check]
---

**증상**: skill / docs 변경 commit 직전 `git branch --show-current` 안 함 → PR 작업 브랜치에 무관 commit 박힘.
**왜**: skill 외부 작업이라도 자동 mode 가 자동 switch 하는 듯. 같은 세션 두 번 발생.

**규칙**: 모든 commit 직전 `git branch --show-current` 강제 확인. main 작업이면 main, PR 브랜치 작업이면 PR 브랜치 확인 후 commit.
