# Phase 03 — team/ 이전 (common-pitfalls 섹션2, 2-1~2-10)

## 컨텍스트

`.claude/skills/_shared/common-pitfalls.md` 의 **섹션 2 (`# 2. team 운영`)** 하위 패턴
`## 2-1` ~ `## 2-10` (10개)을 `docs/pitfalls/team/` 아래 파일 1개씩으로 이전한다.

형식·slug·무손실은 **phase-01.md 규격** 준수. `category: team`. `source` 에 원본 번호(예: `2-4`) 보존.

## 원본 패턴 목록 (10 — 완결성 대조용)

2-1 팀원 SendMessage 회신 누락 · 2-2 팀원 자발적 실행 · 2-3 self-shutdown 패턴 ·
2-4 executor cwd 격리 (main repo 오염 방지) · 2-5 executor scope 확장 자체 판단 ·
2-6 critic v2 재평가 시 신 파일 미재읽기 · 2-7 code-reviewer 에 plan 비자명 설계 결정 미전달 ·
2-8 task 재분할 시 index.json 갱신 누락 · 2-9 cwd 추적 + 양쪽 git status 검증 ·
2-10 브랜치 확인 누락 commit 사고

각 항목 → `docs/pitfalls/team/<slug>.md` 1파일.

## 섹션 소진 체크리스트 처리

`## 섹션 2 소진 체크리스트` → `docs/pitfalls/team/00-checklist.md` (phase-02 의 plan 체크리스트와 동일 방식).

## 작업 항목 (5개 이하)

1. 원본 섹션 2 (`## 2-1` ~ `## 2-10`) 를 phase-01 규격 파일로 `docs/pitfalls/team/` 에 생성 (10파일).
2. `## 섹션 2 소진 체크리스트` → `docs/pitfalls/team/00-checklist.md`.
3. `related` 링크 채움 (예: 2-4 cwd 격리 ↔ 2-9 cwd 추적, 2-10 브랜치 commit). 불확실하면 빈 배열.
4. 완결성 검증 통과.
5. `index.json` phase 3 completed, current_phase 4 갱신.

## 검증 (완결성)

```bash
grep -cE "^## 2-[0-9]+\." .claude/skills/_shared/common-pitfalls.md   # 기대 10
ls docs/pitfalls/team/*.md | wc -l                                    # 기대 11 (10 + 00-checklist)
```

- 원본 미변경.
