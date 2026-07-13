# Phase 05 — code-review/ 이전 (code-review-pitfalls.md 13항목)

## 컨텍스트

`.claude/skills/_shared/code-review-pitfalls.md` 의 카테고리별 항목 13개를
같은 `docs/pitfalls/code-review/` 아래로 이전한다 (phase 4 의 CLI 25개와 합류).

형식·slug·무손실은 **phase-01.md 규격** 준수. `category: code-review`.
`source` 에 `code-review <원본번호>` 로 명시(예: `code-review 5-2`) — common-pitfalls CLI 번호와 구분.

## 원본 항목 목록 (13 — 완결성 대조용)

- 카테고리 1 (spinner·UX): 1-1 validation 전 spinner 시작 · 1-2 spinner 후 try/catch 없이 API 호출 · 1-3 resolver-before-editor
- 카테고리 2 (에러 처리): 2-1 await fn():Promise<never> catch never-path 미추론(TS2366) · 2-2 err.exitCode 분기 시 매핑 미확인 · 2-3 테스트 mock reject 가 production mirror 안 함
- 카테고리 4 (CLI 도메인): 4-1 interactive 경고 vs 실제 동작 mismatch
- 카테고리 5 (타입 안전성): 5-1 Map.has → get()! non-null assertion · 5-2 as unknown as T 이중 단언
- 카테고리 6 (API/HTTP): 6-1 redirect manual + status 분기 누락
- 카테고리 7: 7-1 문서 자리수/범위 표기와 코드 regex 불일치 · 7-2 조기 반환에서 출력 모드 분기 누락
- 카테고리 8 (PII): 8-1 src/ 테스트 fixture·에러 메시지의 사내 식별자

각 항목 → `docs/pitfalls/code-review/<slug>.md` 1파일 (13파일).

## 처리 규칙

- **카테고리 3 (매직 넘버, `# 3. 매직 넘버·문자열 (예약)`)** 은 항목 없는 예약 자리 → 파일 생성 안 함.
- 메타 섹션(`## 호출 시점` / `## 축적 규칙` / `## 회고 절차`)은 패턴이 아님 → **INDEX.md(phase 1)에 이미 흡수**됨. 중복 파일 생성 금지. INDEX 에 빠진 code-review 고유 "호출 시점" 뉘앙스가 있으면 INDEX 에 보강.
- `5-2` (as unknown as T 이중 단언) → phase 4 의 CLI24/CLI5/CLI25 와 `related` 상호 링크.

## 작업 항목 (5개 이하)

1. 원본 code-review-pitfalls.md 13항목을 phase-01 규격 파일로 `docs/pitfalls/code-review/` 에 추가 (13파일).
2. `5-2` ↔ 이중 단언 계열(CLI5/CLI24/CLI25) `related` 상호 링크 완성.
3. 메타 섹션이 INDEX 에 모두 반영됐는지 확인 (누락 시 INDEX 보강).
4. 완결성 검증 통과.
5. `index.json` phase 5 completed, current_phase 6 갱신.

## 검증 (완결성)

```bash
# 원본 항목 헤더 수 (기대 13 — 카테고리 3 예약 제외)
grep -cE "^## [0-9]+-[0-9]+\." .claude/skills/_shared/code-review-pitfalls.md
# code-review/ 총 파일 수 (phase4 25 + phase5 13 = 38)
ls docs/pitfalls/code-review/*.md | wc -l
```

- 38파일. 원본 2파일 미변경.
