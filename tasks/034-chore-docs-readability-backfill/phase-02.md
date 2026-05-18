# Phase 02 — docs/{code-architecture,prd,flow,data-schema}.md 정리

## 컨텍스트

phase-01 의 5 패턴 처방을 planning docs 4개에 적용한다. ADR.md 와 동일 정책 — manual Edit 필수.

대상 4 파일:
- `docs/code-architecture.md` — 디렉터리 트리 + 모듈 의존 관계 + 출력 원칙 등
- `docs/prd.md` — MVP 범위 + 기능 카탈로그
- `docs/flow.md` — 사용자 흐름 시나리오
- `docs/data-schema.md` — 캐시 디렉터리 + 스키마

**범위 외 (명시적 제외)**:
- `docs/guide-mvp-with-ai-agent.md` — v1 구현 공유용 가이드 문서. 본 task scope 외 (사용자 결정, plan034 REVISE 사이클).

## 변경 파일

기대 결과 (총 4 파일):
```
docs/code-architecture.md
docs/prd.md
docs/flow.md
docs/data-schema.md
```

## 작업 항목 (5개 이하)

### 1. `docs/code-architecture.md` 정리

- 디렉터리 트리 (``` 안의 주석) — 한 줄 한 항목 형식 유지 (이미 5 패턴 준수에 가까움)
- 트리 외부의 prose 단락 (모듈 의존 관계 / API Client 구조 / 에러 처리 원칙 / 출력 원칙 / 테스트 / 빌드·배포) 에 5 패턴 적용
- 트리 주석 중 한 줄이 길어진 항목 (예: `match.ts` / `member-group.ts` / `post-tags.ts` — 본 task 진행 중 추가된 설명들) 은 의미 단위 분할

자체 점검:
```bash
awk '{if (length($0) > 200) print NR": "length($0)"자"}' docs/code-architecture.md
# 기대: 트리 주석 외 0건
```

### 2. `docs/prd.md` 정리

MVP 범위 bullet list 가 메인이라 5 패턴 위반이 적을 가능성. 단:
- 각 기능 한 줄 설명에 슬래시 나열이나 괄호 중첩 있는지 점검
- prose 단락 (있다면) 에 semantic line break

### 3. `docs/flow.md` 정리

사용자 시나리오 단락이 핵심.
- 시나리오 본문이 만연체로 흐르는지 점검
- "사용자: ... AI: ... 시스템: ..." 같은 대화 형식이면 그 자체로 5 패턴 친화적

### 4. `docs/data-schema.md` 정리

캐시 디렉터리 트리 / interface 정의 / 예시 JSON 이 핵심.
- 코드 블록 자체는 5 패턴 미적용 (코드 / JSON 은 별 룰)
- 코드 블록 외부 설명 prose 에만 적용

### 5. 전체 자체 점검 + commit

```bash
# 4 파일 모두 enumerated inline 0건
grep -nE "①|②|③|④|⑤|⑥|⑦|⑧|⑨" docs/code-architecture.md docs/prd.md docs/flow.md docs/data-schema.md
# 기대: 0건

# 한 줄 200자 초과 (코드 블록 / 표 행 제외 기준 — 수동 검토)
for f in docs/code-architecture.md docs/prd.md docs/flow.md docs/data-schema.md; do
  echo "=== $f ==="
  awk '{if (length($0) > 200) print NR": "length($0)"자"}' "$f"
done
```

commit:

```bash
git add docs/code-architecture.md docs/prd.md docs/flow.md docs/data-schema.md
git commit -m "$(cat <<'EOF'
chore(docs): backfill planning docs to 5-pattern readability style

CLAUDE.md "docs / ADR 작성 형식" 5 패턴 적용 (phase 2/3, task 034):
- code-architecture.md / prd.md / flow.md / data-schema.md prose 단락
- 코드 블록 / 디렉터리 트리 / interface 정의는 별 룰 — 미적용
EOF
)"
```

## code-review-pitfalls 회피 항목

- **1-11 (sed 자기참조)**: manual Edit
- **외과적 변경**: prose 만 손대고 트리 / 코드 블록 / 표는 그대로
- **의미 보존**: 디렉터리 트리 주석 정리 시 정보 누락 검증

## 성공 기준

```bash
# 1. enumerated inline 0건
grep -nE "①|②|③|④|⑤|⑥|⑦|⑧|⑨" docs/code-architecture.md docs/prd.md docs/flow.md docs/data-schema.md
# 기대: 0건

# 2. 4 파일 모두 phase 시작 전 대비 줄 수 증가 (semantic line break 효과)
# 사전에 wc -l 로 기록한 baseline 과 비교

# 3. ADR / CLAUDE.md 미수정 (외과적)
git diff --name-only HEAD~1..HEAD -- docs/adr.md CLAUDE.md
# 기대: 비어 있음 (본 phase commit 에는 미포함)
```

## 작업 외 금지

- README / SKILL.md 변경 금지 — phase-03
- 신규 단락 / 섹션 추가 금지 — 정리만
- 정책 본문 (CLAUDE.md) 변경 금지

## 커밋

위 5번 작업 항목 참조.
