# Phase 2: 검증 + task 완료 처리

## 컨텍스트

phase-01의 docs 변경을 기계적으로 검증하고 `index.json`을 `completed`로 확정. 이 plan은 코드 변경이 없으므로 빌드 영향은 없으나 무회귀 확인 차원에서 빌드 1회 수행.

### 먼저 읽을 파일

- `tasks/009-docs-cleanup-adr/index.json` — 완료 처리 대상

## 목표

1. `pnpm run build` 무회귀 확인 (docs only PR이지만 정합성 차원)
2. ADR-001 / ADR-016 변경 정합성 grep 재검증
3. CLAUDE.md "상황별 ADR 필수 참조" 표의 ADR-016 참조가 여전히 유효한지 (참조된 ADR이 삭제되거나 재구성되지 않았는지)
4. `index.json` 완료 처리

## 작업 목록 (4개)

### 1) 빌드 무회귀

```bash
# cwd: /Users/nhn/personal/dooray-cli
pnpm run build
ls -la dist/index.js
```

기대: build 성공 (exit 0). 번들 크기 변화 없음 (docs only).

### 2) ADR 정합성 grep

```bash
# cwd: /Users/nhn/personal/dooray-cli

# ADR-001 형식 통일 확인
sed -n '/^## ADR-001:/,/^## ADR-002:/p' docs/adr.md | grep -c "트레이드오프" || echo "OK_001"
sed -n '/^## ADR-001:/,/^## ADR-002:/p' docs/adr.md | grep -c "대안 기각"

# ADR-016 압축 확인
sed -n '/^## ADR-016:/,/^## ADR-017:/p' docs/adr.md | grep -cE "^[1-6]\. " || echo "OK_016"
sed -n '/^## ADR-016:/,/^## ADR-017:/p' docs/adr.md | grep -c "flow.md"

# ADR-016 다른 절 보존 확인 (결정/이유/라이브러리/안전성)
sed -n '/^## ADR-016:/,/^## ADR-017:/p' docs/adr.md | grep -cE "^\*\*결정\*\*|^\*\*이유\*\*|^\*\*라이브러리\*\*|^\*\*안전성\*\*"
```

기대:
- ADR-001: "트레이드오프" 0회, "대안 기각" 1회 이상
- ADR-016: 번호 목록 0회, "flow.md" 1회 이상, 핵심 절 4개(결정/이유/라이브러리/안전성) 모두 보존

### 3) CLAUDE.md ↔ ADR 참조 정합성

```bash
# CLAUDE.md "상황별 ADR 필수 참조" 표가 가리키는 ADR 번호가 모두 adr.md에 실제 존재하는지
grep -oE "ADR-[0-9]+" CLAUDE.md | sort -u | while read adr; do
  if grep -qE "^## $adr:" docs/adr.md; then
    echo "$adr ✓"
  else
    echo "$adr MISSING"
  fi
done
```

기대: 모든 행에 `✓` 출력 (`MISSING` 없음).

### 4) `index.json` 완료 처리

Edit 도구로 `tasks/009-docs-cleanup-adr/index.json` 수정:

- 최상위 `status`: `"pending"` → `"completed"`
- 최상위 `current_phase`: `2`
- 최상위 `updated_at`: 현재 ISO 8601 타임스탬프
- `phases[0].status`, `phases[1].status`: 모두 `"completed"`

**반드시 위 1~3 모두 통과 후 수행.**

## 성공 기준

- [ ] `pnpm run build` 성공 (exit 0)
- [ ] `dist/index.js` 번들 크기 변화 없음 또는 무시 가능
- [ ] ADR-001: "트레이드오프" grep 0, "대안 기각" grep ≥ 1
- [ ] ADR-016: 번호 목록 grep 0, "flow.md" grep ≥ 1, 핵심 4절 보존
- [ ] CLAUDE.md 참조 ADR 모두 adr.md에 실재 (`MISSING` 없음)
- [ ] `git diff --stat src/` → 변경 없음 (docs only)
- [ ] `jq -r '.status' tasks/009-docs-cleanup-adr/index.json` → `completed`
- [ ] `jq -r '[.phases[].status] | unique | .[]' tasks/009-docs-cleanup-adr/index.json` → `completed` (단일 값)

## 주의사항

- **이 phase는 코드 변경 금지** — 검증 실패 시 phase-01 재개
- 빌드 실패가 나면 docs와 무관 — pre-existing 이슈 가능성. 검증 후 보고
- **4) 스텝은 반드시 1~3 모두 통과 후** — 검증 실패 상태에서 completed 전환 금지

## Blocked 조건

- `pnpm run build` 실패 → `PHASE_BLOCKED: 빌드 실패 (docs only인데 실패하면 사전 존재한 빌드 에러)`
- ADR 정합성 grep 실패 → `PHASE_BLOCKED: phase-01 재개`
- CLAUDE.md ADR 참조 `MISSING` 발견 → `PHASE_BLOCKED: 참조 ADR이 adr.md에서 사라짐 (별도 조사 필요)`
