# Phase 03 — 참조 10파일 갱신 + 옛 docs/adr.md 삭제 + 검증

## 컨텍스트

ADR 분리(phase 1~2) 후, `docs/adr.md` 를 **경로로** 참조하던 곳을 `docs/adr/` 로 돌리고 옛 파일을 삭제한다.
**번호 참조(`ADR-019`, `source:[ADR#]`)는 식별자라 그대로 둔다** — INDEX 가 번호→파일 매핑. 경로 문자열 참조만 대상.

worktree·branch 동일. 삭제는 참조 갱신 후에만.

## 경로 참조 파일 (실측 10 — 편집 대상)

작업 시작 시 실제 목록 재확인:
```bash
WT=/Users/nhn/personal/dooray-cli/.claude/worktrees/adr-directory-split
grep -rln "docs/adr\.md\|adr\.md" "$WT"/docs "$WT"/CLAUDE.md "$WT"/.claude "$WT"/README.md "$WT"/skills 2>/dev/null | grep -v "docs/adr.md$"
```

### 갱신 지침 (파일별)

- **`.claude/agents/dooray-cli-docs-verifier.md`** (가장 중요) — `docs/adr.md` 를 파싱하는 grep/awk 블록들을 **디렉터리 순회로 재작성**. 검사 *의도*를 보존하되 대상을 바꾼다:
  - `grep -oE '^## ADR-[0-9]+' docs/adr.md` → `grep -hoE '^## ADR-[0-9]+' docs/adr/*-*.md`
  - INDEX↔본문 정합(`\[ADR-NNN\](#adr-NNN)`) → `docs/adr/INDEX.md` 의 `NNN-slug.md` 링크 ↔ 실제 파일 존재 대조
  - per-ADR 본문 크기 `awk "/<a id=\"adr-$n\"/,/^---$/" docs/adr.md` → 파일 직접 (`cat docs/adr/$n-*.md`)
  - `grep -cE "^---$" docs/adr.md` (구분자 카운트) → 파일 분리로 무의미 → 제거하거나 "파일 수 == ADR 수" 검사로 대체
  - 각 블록의 목적(ADR 완결성 / INDEX 동기화 / 본문 비어있지 않음)을 유지하는 게 핵심.
- **`.claude/agents/dooray-cli-executor.md`** — "ADR 본문: `docs/adr.md` (단일 소스)" → "ADR 본문: `docs/adr/` (ADR 1개 = 파일 1개, 목록은 `docs/adr/INDEX.md`)".
- **`docs/guide-mvp-with-ai-agent.md`** — `docs/adr.md` 링크 → `docs/adr/`(디렉터리) 또는 `docs/adr/INDEX.md`. 트리 다이어그램의 `adr.md` 줄 → `adr/`. stale 문구 "9개 기술 결정" → 실제 수(28) 또는 수치 제거.
- **`.claude/skills/docs-check/SKILL.md`** — `adr.md` 경로 언급 → `adr/`(디렉터리). 리포트 형식 예시 "docs/adr.md ADR-XXX" 는 "docs/adr/ ADR-XXX" 로. 번호 참조 자체는 유지.
- **`CLAUDE.md`** — "파일 읽기 효율" 의 `(docs/adr.md 등)` → `(docs/adr/ 등)`. 다른 `docs/adr.md` 경로 문자열 있으면 동일 교체. 상황별 ADR 표의 번호 참조는 불변.
- 그 외 grep 결과 파일도 같은 원칙(경로→`docs/adr/`, 번호 유지).

## 작업 항목 (5개 이하)

1. 경로 참조 파일 전부 위 지침대로 갱신 (docs-verifier 스크립트 재작성 포함).
2. 옛 파일 삭제: `git -C "$WT" rm docs/adr.md`.
3. docs-verifier 재작성 스크립트를 실제 실행해 에러 없이 도는지 확인.
4. 잔존 경로 참조 grep 0건 + 전체 검증 통과.
5. index.json phase 3 completed + status "completed". commit (`chore(adr): update references + remove monolith docs/adr.md`).

## 검증

```bash
WT=/Users/nhn/personal/dooray-cli/.claude/worktrees/adr-directory-split
# 1) 옛 파일 경로 잔존 참조 0 (번호 ADR-NNN 은 제외 — 경로 adr.md 만)
grep -rn "docs/adr\.md\|[^/]adr\.md" "$WT"/docs "$WT"/CLAUDE.md "$WT"/.claude "$WT"/README.md "$WT"/skills 2>/dev/null | grep -v "docs/adr/"
# → 0건

# 2) 옛 파일 삭제
ls "$WT/docs/adr.md" 2>&1   # No such file

# 3) 파일 수 28 + INDEX
ls "$WT"/docs/adr/*-*.md | wc -l   # 28
test -f "$WT/docs/adr/INDEX.md" && echo INDEX OK

# 4) docs-verifier 재작성 블록이 새 구조에서 에러 없이 실행되는지(해당 스크립트 직접 실행)
```

- 번호 참조(`ADR-019` 등)는 CLAUDE.md 표·pitfalls source 에 그대로 남아야 정상(경로 아님).
- 코드 변경 0 — docs 전용.
