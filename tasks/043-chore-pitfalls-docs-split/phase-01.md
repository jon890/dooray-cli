# Phase 01 — docs/pitfalls/ 스캐폴드 + INDEX.md 규격 고정

## 컨텍스트

monolithic pitfalls 문서 2개를 docu-parser 구조(패턴 1개 = 파일 1개)로 분리한다.
본 phase 는 **디렉터리 스캐폴드 + INDEX.md + 패턴 파일 형식 규격**을 만든다.
이후 phase 2~5 가 이 규격을 그대로 따라 패턴 파일을 채운다.

**작업 위치 (worktree)**: 모든 경로는 이 worktree 루트 기준이다.
`/Users/nhn/personal/dooray-cli/.claude/worktrees/pitfalls-docs-split`
아래 `docs/pitfalls/` 은 이 루트의 `docs/pitfalls/` 다 (main 작업트리 아님).

**원본 (읽기 전용, 이 phase 에서 삭제 금지)**:
- `.claude/skills/_shared/common-pitfalls.md` (731줄)
- `.claude/skills/_shared/code-review-pitfalls.md` (332줄)

원본 삭제는 phase 6 에서만.

## 목표 디렉터리 구조

```
docs/pitfalls/
  INDEX.md
  plan/          # phase 2 가 채움 (common-pitfalls 섹션1)
  team/          # phase 3 (common-pitfalls 섹션2)
  code-review/   # phase 4~5 (common-pitfalls 섹션4 + code-review-pitfalls)
```

## 패턴 파일 형식 규격 (이후 phase 가 준수)

각 패턴 = 파일 1개. frontmatter + 본문.

```yaml
---
id: <kebab-slug>              # 영어 kebab-case, 번호 아님 (예: adr-number-collision)
category: plan | team | code-review
title: <원본 패턴 제목 그대로>
triggers: [<키워드>, ...]     # 한/영 키워드 (원본 제목·본문에서 추출)
tool_catchable: true | false  # ruff/tsc/test 가 이미 잡으면 true
source: [<출처>]              # 원본 번호(1-3 / 2-5 / CLI7 / code-review 5-2) + PR#/ADR# 있으면 함께
related: [<다른 id>, ...]     # 관련 패턴 id (없으면 빈 배열)
---

**증상**: ...
**Good**: ...
**검출**: (grep/find 명령 있으면 코드블록)
**Self-check**: ...
**Why**: ...
```

### slug 규칙 (id)

- 원본 제목의 핵심을 영어 kebab-case 로. 번호(1-3, CLI7)를 slug 에 넣지 않는다.
- 예: `## 1-9. macOS BSD sed \b 미지원` → `id: bsd-sed-word-boundary`
- 예: `## CLI7. 외부 응답 fileName 으로 경로 조립 (path traversal)` → `id: filename-path-traversal`
- 파일명 = `<id>.md`.
- **원본 번호는 버리지 않는다** — frontmatter `source` 에 보존 (추적성).

### 내용 무손실 원칙

- 본문(증상/Good/검출/Self-check/Why)은 원본 텍스트를 **누락 없이** 옮긴다. 요약·재작성 금지.
- 원본에 일부 항목(예: Self-check 없음)이 없으면 해당 줄 생략(억지 생성 금지).
- 중복 의심(이중 단언 계열 CLI5/CLI24/CLI25 ↔ code-review 5-2 등)은 **병합하지 말고** 각각 파일로 보존 + `related` 로 상호 링크. dedup 은 후속 task.

## INDEX.md 내용 (이 phase 에서 작성)

docu-parser `pitfalls/INDEX.md` 구조를 따른다. 아래 섹션 포함:

1. **헤더** — "모놀리식이 아니라 패턴 1개 = 파일 1개. 전부 읽지 말고 라우터로 해당 파일만."
2. **소비 방식** — INDEX 라우터 표에서 작업 유형 행 찾기 → 그 파일만 읽기 → 애매하면 카테고리 디렉터리 통째로.
3. **라우터 표** — 카테고리별 소비 시점:

   | 카테고리 | 디렉터리 | 호출 시점 | 사용 스킬 |
   | --- | --- | --- | --- |
   | plan 작성 | `plan/` | task 파일 작성 직후 self-check | planning, build-with-teams |
   | team 운영 | `team/` | 팀원 스폰·메시지 작성 시 | build-with-teams |
   | code-review | `code-review/` | 코드 작성·리뷰 시 | build-with-teams, review-fix |

4. **축적 규칙** — 원본 두 파일의 "축적 규칙" + common-pitfalls 섹션3 누적 규칙을 통합.
   - 재발성 / 심각도 / 도구로 못 잡음 / 추상화 가능 4조건 게이트.
   - 1회성 지적은 PR reply 로 끝냄.
   - 주기적 prune·automate 패스 (도구 승격 가능 패턴은 옮기고 파일 삭제).
   - PR review 누적은 `review-fix` 6.5단계 절차.
5. **파일 형식** — 위 "패턴 파일 형식 규격" 을 그대로 기술.

INDEX 는 라우터·규칙만. 개별 패턴 내용은 담지 않는다(rot 방지).

## 작업 항목 (5개 이하)

1. `docs/pitfalls/plan/` `docs/pitfalls/team/` `docs/pitfalls/code-review/` 디렉터리 생성 (`.gitkeep` 불필요 — phase 2~5 가 파일 채움).
2. 위 규격대로 `docs/pitfalls/INDEX.md` 작성 (라우터 표 + 축적 규칙 + 파일 형식).
3. INDEX 가독성 자체 점검 (CLAUDE.md "docs / ADR 작성 형식" 6패턴).
4. `index.json` 의 phase 1 status 를 completed 로, current_phase 2 로 갱신.

## 검증

- `ls -d docs/pitfalls/plan docs/pitfalls/team docs/pitfalls/code-review` 3개 존재.
- `docs/pitfalls/INDEX.md` 에 라우터 표 + 축적 규칙 + 파일 형식 3섹션 존재.
- 원본 2파일 미변경 (`git status` 에 common-pitfalls.md / code-review-pitfalls.md 없음).
