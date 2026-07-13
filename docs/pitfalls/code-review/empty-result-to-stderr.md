---
id: empty-result-to-stderr
category: code-review
title: "정상 빈 결과 메시지를 stderr 로 출력"
triggers: [stderr, 빈 결과, quiet, stdout 컨벤션]
tool_catchable: false
source: [CLI8, PR #40]
related: []
---

**증상**: 첨부 0 개 / 댓글 0 개 같은 **정상 빈 상태** 메시지를 `process.stderr.write` 로 보냄.
CLAUDE.md 컨벤션은 `데이터=stdout / 에러·진행로그=stderr`.
빈 결과는 에러가 아니므로 stderr 위반 + 자동화 파이프 처리 어색함.
**Good**: 빈 결과는 `--json` 시 `[]` / `{}` stdout, 일반 모드는 `'결과 없음'` 등 stdout 또는 무출력. `--quiet` 시 무출력.
**검출**: `grep -rnE 'stderr\.write.*없음|stderr\.write.*empty' src/commands/`.
**Why**: PR #40 review — `comment file list` 가 "첨부 없음" 을 stderr 출력 → 컨벤션 위반.
