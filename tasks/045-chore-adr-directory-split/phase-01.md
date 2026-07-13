# Phase 01 — docs/adr/ 스캐폴드 + INDEX.md + 파일 형식 규격

## 컨텍스트

monolithic `docs/adr.md` (688줄, 28 ADR)를 docu-parser 구조(ADR 1개 = 파일 1개)로 분리한다.
본 phase 는 `docs/adr/` 디렉터리 + INDEX.md + 파일 형식 규격을 만든다.

**작업 위치**: worktree `/Users/nhn/personal/dooray-cli/.claude/worktrees/adr-directory-split`. 경로 이 루트 기준. git `git -C <wt>`. branch `chore/adr-directory-split`.

**원본**: `docs/adr.md` (읽기 전용, phase 3 에서만 삭제).

## 목표 구조

```
docs/adr/
  INDEX.md            # intro + 번호→파일 링크 목록
  001-typescript-node.md ~ 031-file-json-output-schema.md   # 28파일 (phase 2)
```

## 파일 형식 규격 (phase 2 가 준수)

각 ADR 파일 = 원본의 `## ADR-NNN: Title` 섹션을 **verbatim** 이전.
- frontmatter 없음 (docu-parser 방식).
- 파일은 `## ADR-NNN: Title` 헤더로 시작, 본문(`- **결정** / **맥락** / **대안 기각** / **트레이드오프** 등) 원본 그대로.
- 원본의 `<a id="adr-NNN"></a>` 앵커와 ADR 사이 `---` 구분자는 **제거**(파일 분리로 불필요).
- 파일명 = `NNN-slug.md` (slug 은 phase 2 매핑 표).

## INDEX.md 내용 (이 phase 작성)

docu-parser `docs/adr/INDEX.md` 구조를 따른다:

1. 제목 `# Architecture Decision Records`.
2. intro — 원본 docs/adr.md 상단 문구 + docu-parser intro 취지 통합:
   - "각 ADR 은 결정의 무엇·왜·대안 기각만 담는다. 구현 세부는 코드에. 자명한 사항은 기록 안 함."
   - "ADR 작성 전 [`planning` 스킬의 8단계 ADR 작성 전 점검](../../.claude/skills/planning/SKILL.md) 통과 확인."
   - "ADR-NNN 내용은 `docs/adr/NNN-*.md` (번호 glob) 또는 아래 목록 링크로 찾는다."
   - "상황별 코드 작업 시 참조 ADR 은 [`CLAUDE.md` 상황별 ADR 필수 참조 표](../../CLAUDE.md) 에서 찾는다."
3. `---` 후 목록 — 기존 docs/adr.md 의 ADR Index 항목을 그대로 옮기되 링크를 **`#adr-NNN` 앵커 → `NNN-slug.md` 파일**로 교체.
   - 예: `- [ADR-001](#adr-001) — TypeScript ...` → `- [ADR-001](001-typescript-node.md) — TypeScript (Node.js) 선택`
   - 28개 항목 전부. 한 줄 요약은 기존 것 유지.

## 작업 항목 (5개 이하)

1. `docs/adr/` 디렉터리 생성.
2. `docs/adr/INDEX.md` 작성 (intro + 28개 번호→파일 링크 목록).
3. INDEX 가독성 자체 점검 (CLAUDE.md 6패턴).
4. index.json phase 1 completed, current_phase 2. commit (`chore(adr): scaffold docs/adr + INDEX`, 끝 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`).

## 검증

- `docs/adr/INDEX.md` 존재, 목록 항목 28개(`grep -cE "^- \[ADR-" docs/adr/INDEX.md` == 28).
- 링크가 `NNN-slug.md` 형식(앵커 `#adr-` 잔존 0: `grep -c "#adr-" docs/adr/INDEX.md` == 0).
- 원본 docs/adr.md 미변경.
