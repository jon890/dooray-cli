# Phase 01 — docs/adr.md ADR-001~027 본문 정리 (6가지 패턴 적용)

## 컨텍스트

`CLAUDE.md` 의 신규 섹션 "docs / ADR 작성 형식" 에 정의된 6가지 패턴을 ADR.md 본문 27개 (003/009/011 결번 제외) 전체에 적용한다.

6가지 패턴:
1. semantic line break (문장당 1줄)
2. enumerated inline 금지 (`①②③` / `1)2)3)` / 슬래시 3개 이상 나열 → bullet)
3. 괄호 중첩 2겹 이상 금지
4. `=` / `→` 동치·인과 압축 한 단락 1회만
5. 한 문장이 길면 의미 단위 분할 (80자 + 백틱 3개 이상 / 괄호 다수)
6. 한 bullet 에 다중 속성 압축 금지 — sub-bullet 으로 분리

**중요 — manual Edit 필수**: `sed` 일괄 치환은 정책 자체 표현 자기참조 위험 (common-pitfalls 1-11). Edit 도구로 ADR 단위로 검토 + 수정.

## 변경 파일

```bash
git diff <base>..HEAD --name-only
```

기대 결과 (총 1 파일):
```
docs/adr.md
```

## 작업 항목 (5개 이하)

### 1. ADR-001 ~ ADR-010 정리

대상 ADR: 001 / 002 / 004 / 005 / 006 / 007 / 008 / 010 (8개).

각 ADR 본문에서 6가지 패턴 위반을 찾아 개선 적용:
- **결정** / **이유** / **이유 (bullet)** / **트레이드오프** / **재검토 시점** 단락
- 한 단락 다문장 → semantic line break
- 긴 문장 → 의미 단위 분할

자체 점검 — 개선 후 ADR 별로 다음 검증:
```bash
# ADR 헤딩부터 다음 ADR 까지의 영역에서 한 줄이 200자 초과인 줄
awk '/^## ADR-001/,/^## ADR-002/ {if (length($0) > 200) print NR": "length($0)"자"}' docs/adr.md
```

200자 초과 줄이 남아 있으면 의미 단위 분할 미적용 — 추가 손.

### 2. ADR-012 ~ ADR-020 정리

대상 ADR: 012 / 013 / 014 / 015 / 016 / 017 / 018 / 019 / 020 (9개).

ADR-019 **확장** 단락 (Issue #66, 2026-05-18 추가분) 도 함께 점검 — 본 task 와 직전에 추가된 단락은 이미 6가지 패턴에 가까울 수 있으나 일관성 확보.

### 3. ADR-021 ~ ADR-027 정리

대상 ADR: 021 / 022 / 023 / 024 / 025 / 026 / 027 (7개).

특별 주의:
- **ADR-027** 의 결정 `①②③` enumerated inline → bullet list
- **ADR-024** 의 `=` 동치 압축 단락 → 풀어쓰기 또는 bullet
- **ADR-022** 의 괄호 4겹 중첩 → 단락 분리
- **ADR-026** 마지막 단락 (Issue #65 추가분) 도 일관성 확보

### 4. ADR Index (line 3~30) 검토

본 phase 는 본문만 손대고 Index 한 줄 요약은 **그대로 유지** (이미 한 줄당 1 ADR 형식, 6가지 패턴 위반 없음 — 변경 불요).

자체 점검:
```bash
awk '/^## ADR Index/,/^---/' docs/adr.md | grep -cE "^\- \[ADR-"
# 기대: 24 이상 (현재 등록된 ADR 수)
```

### 5. 전체 자체 점검 + commit

```bash
# enumerated inline 잔존 (한국어 docs 한정 — ASCII 1)2)3) 도 검출)
grep -nE "①|②|③|④|⑤|⑥|⑦|⑧|⑨" docs/adr.md
# 기대: 0건

# 한 줄 200자 초과 (의미 단위 분할 미적용 의심)
awk '{if (length($0) > 200) print NR": "length($0)"자"}' docs/adr.md
# 기대: 0건 또는 사용자와 합의된 예외만 (예: 표 한 줄)

# 토큰 수 추이 (참고용 — markdown 렌더링은 동일이므로 LLM 입력 토큰만 비교)
wc -c docs/adr.md
# 본 task 시작 전 대비 ±10% 이내 권장
```

위 점검 통과 시 commit:

```bash
# index.json 은 phase-03 에서 마킹 — phase-01 commit 에는 미포함
git add docs/adr.md
git commit -m "$(cat <<'EOF'
chore(docs): backfill ADR-001~027 to 5-pattern readability style (Issue #N/A)

CLAUDE.md "docs / ADR 작성 형식" 6가지 패턴 적용 (phase 1/3, task 034):
- semantic line break (문장당 1줄)
- enumerated inline 제거 (ADR-027 ①②③ → bullet)
- 괄호 중첩 평탄화 (ADR-022 4겹 → 단락 분리)
- 동치 압축 풀어쓰기 (ADR-024 = 표기)
- 의미 단위 분할 (긴 문장)

본 commit 은 본문 정리만. ADR Index 한 줄 요약은 그대로 유지.
EOF
)"
```

## code-review-pitfalls 회피 항목

- **1-11 (sed 자기참조 일괄 치환)**: manual Edit 사용 — sed 미사용
- **외과적 변경**: ADR 본문만 손대고 Index / 헤딩 / anchor 는 그대로
- **의미 보존**: 정리 과정에서 의사결정 의도 (결정 / 맥락 / 대안 기각) 가 누락되지 않는지 ADR 단위로 사전 sanity check

## 성공 기준

```bash
# cwd: /Users/nhn/personal/dooray-cli

# 1. enumerated inline 0건
grep -nE "①|②|③|④|⑤|⑥|⑦|⑧|⑨" docs/adr.md
# 기대: 0건

# 2. 한 줄 200자 초과 줄 카운트 (참고 — 0 목표지만 표 행은 예외 가능)
awk '{if (length($0) > 200) print NR}' docs/adr.md | wc -l
# 기대: phase 시작 전 대비 명백한 감소

# 3. ADR 헤딩 수 보존
grep -cE "^## ADR-[0-9]+" docs/adr.md
# 기대: phase 시작 전과 동일 (24개 — 003/009/011 결번)

# 4. ADR Index 보존
grep -cE "^\- \[ADR-" docs/adr.md
# 기대: phase 시작 전과 동일
```

## 작업 외 금지

- ADR 신규 추가 / 삭제 / 헤딩 변경 금지 — 본문만 정리
- planning docs / README / SKILL.md 변경 금지 — phase-02 / phase-03
- CLAUDE.md / planning/SKILL.md 정책 본문 변경 금지 — task 생성 시점 commit 으로 반영됨
- 새 ADR 작성 금지

## 커밋

위 5번 작업 항목 commit 명령 참조. 한 번에 하나의 PR.
