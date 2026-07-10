# Phase 02 — plan/ 이전 (common-pitfalls 섹션1, 1-1~1-16)

## 컨텍스트

`.claude/skills/_shared/common-pitfalls.md` 의 **섹션 1 (`# 1. plan 작성 (critic 회피)`)** 하위 패턴
`## 1-1` ~ `## 1-16` (16개)을 `docs/pitfalls/plan/` 아래 파일 1개씩으로 이전한다.

형식·slug 규칙·무손실 원칙은 **phase-01.md 의 "패턴 파일 형식 규격" 을 그대로 따른다**.
`category: plan`. `source` 에 원본 번호(예: `1-9`) 보존.

## 원본 패턴 목록 (16 — 완결성 대조용)

1-1 수치 추측 (파일 수 / 줄 수) · 1-2 파일 범위 부정확 · 1-3 이전 plan / main 커밋 상호작용 누락 ·
1-4 실행 컨텍스트 모호 (cwd / branch) · 1-5 "눈으로 확인" 검증 · 1-6 외부 상태 gate 부재 ·
1-7 새 불변식 4면 가드 누락 · 1-8 마지막 phase index.json completed 마킹 누락 ·
1-9 macOS BSD sed \b 미지원 · 1-10 type 추가/삭제 phase tsc --noEmit 누락 ·
1-11 기존 함수 시그니처 미검증 → 빌드 실패 · 1-12 type optional 완화 cascade grep 누락 ·
1-13 .filter() 후 타입 미좁힘 · 1-14 nonInteractive trigger 확장 시 옵션 경고 정리 누락 ·
1-15 resolver 검증 정책 일관성 · 1-16 executor 가 critic 평가 대기 안 함

각 항목 → `docs/pitfalls/plan/<slug>.md` 1파일.

## 섹션 소진 체크리스트 처리

섹션 1 끝의 `## 섹션 1 소진 체크리스트` 는 패턴이 아니라 메타 체크리스트 →
`docs/pitfalls/plan/00-checklist.md` 로 옮긴다 (frontmatter `id: 00-checklist`, `category: plan`, `title: 섹션 소진 체크리스트`).

## 작업 항목 (5개 이하)

1. 원본 섹션 1 (`## 1-1` ~ `## 1-16`) 을 읽어 각 패턴을 phase-01 규격 파일로 `docs/pitfalls/plan/` 에 생성 (16파일).
2. `## 섹션 1 소진 체크리스트` → `docs/pitfalls/plan/00-checklist.md`.
3. `related` 링크 채움 — 명백히 연관된 패턴끼리(예: 1-3 ↔ 1-11 시그니처/상호작용). 불확실하면 빈 배열.
4. 완결성 검증 (아래) 통과.
5. `index.json` phase 2 completed, current_phase 3 갱신.

## 검증 (완결성)

```bash
# 원본 섹션1 패턴 수 (기대 16)
grep -cE "^## 1-[0-9]+\." .claude/skills/_shared/common-pitfalls.md
# 생성 파일 수 (기대 16 + 00-checklist = 17)
ls docs/pitfalls/plan/*.md | wc -l
```

- 16 패턴 + 1 체크리스트 = 17파일. 수 불일치면 누락 파일 보완.
- 각 파일 frontmatter 5키(id/category/title/triggers/tool_catchable/source) 존재.
- 원본 common-pitfalls.md 미변경 (이 phase 는 읽기만).
