# Phase 04 — code-review/ 이전 (common-pitfalls 섹션4, CLI1~25)

## 컨텍스트

`.claude/skills/_shared/common-pitfalls.md` 의 **섹션 4 (`# 4. 레포별 +α (dooray-cli ...)`)** 하위
`## CLI1` ~ `## CLI25` (25개)을 `docs/pitfalls/code-review/` 아래 파일 1개씩으로 이전한다.

형식·slug·무손실은 **phase-01.md 규격** 준수. `category: code-review`.
`source` 에 원본 번호(예: `CLI7`) + 본문에 언급된 PR#/ADR#/Issue# 있으면 함께 보존.

## 파일 수 (완결성 대조용)

- 원본 `## CLIN.` 헤더 25개 → 25파일. slug 은 번호 아닌 영어 kebab (예: `CLI7 path traversal` → `filename-path-traversal`, `CLI2 ky 외 HTTP` → `non-ky-http-client`).
- phase 5 가 code-review-pitfalls.md 항목을 같은 `code-review/` 에 추가하므로, **이 phase 는 CLI 25개만** 담당.

## 중복 후보 (병합 금지 — related 로 링크)

- `CLI5` (JSON.parse as Type) · `CLI24` (as unknown as X|Y 이중 단언) · `CLI25` (테스트 as never) 는
  이중 단언·타입우회 계열로 서로, 그리고 phase 5 의 code-review-pitfalls `5-2` 와 겹친다.
- **각각 파일로 보존**하고 `related` 로 상호 링크만. 내용 병합·삭제 금지 (dedup 은 후속 task).

## 작업 항목 (5개 이하)

1. 원본 섹션 4 (`## CLI1` ~ `## CLI25`) 를 phase-01 규격 파일로 `docs/pitfalls/code-review/` 에 생성 (25파일).
2. 이중 단언 계열(CLI5/CLI24/CLI25) `related` 상호 링크 + phase 5 의 `double-assertion` 계열 id 예약 링크.
3. `tool_catchable` 판정 — tsc/test/grep 로 이미 잡히는 패턴이면 true (예: CLI 중 tsc 로 걸리는 것).
4. 완결성 검증 통과.
5. `index.json` phase 4 completed, current_phase 5 갱신.

## 검증 (완결성)

```bash
grep -cE "^## CLI[0-9]+\." .claude/skills/_shared/common-pitfalls.md   # 기대 25
ls docs/pitfalls/code-review/*.md | wc -l                             # 이 phase 후 25 (phase5 에서 +13)
```

- CLI 번호 1~25 가 각 파일 `source` 에 하나씩 빠짐없이 등장하는지 확인:
  ```bash
  for n in $(seq 1 25); do grep -rql "CLI$n\b" docs/pitfalls/code-review/ || echo "CLI$n 누락"; done
  ```
- 원본 미변경.
