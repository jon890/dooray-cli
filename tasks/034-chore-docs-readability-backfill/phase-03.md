# Phase 03 — README.md + skills/dooray-cli/SKILL.md 정리 + 완료 마킹

## 컨텍스트

phase-01 / phase-02 와 동일 6가지 패턴을 외부 노출 docs 2개에 적용 + task 034 완료 마킹.

대상:
- `README.md` — npm / GitHub 공개 — 사용자가 가장 먼저 읽음. 가독성 가치 최대
- `skills/dooray-cli/SKILL.md` — AI 에이전트가 dooray-cli 자동화에 사용. 토큰 효율 + 가독성 모두 중요

## 변경 파일

기대 결과 (총 3 파일):
```
README.md
skills/dooray-cli/SKILL.md
tasks/034-chore-docs-readability-backfill/index.json
```

## 작업 항목 (5개 이하)

### 1. `README.md` 정리

- "설치" / "사용법" / "환경 설정" / "라이선스" 등 섹션의 prose 단락
- 명령 사용 예 (코드 블록) 은 그대로 — 코드는 6가지 패턴 미적용
- 각 명령 한 줄 설명에 슬래시 나열 (`A / B / C`) 또는 괄호 중첩 점검
- "Issue #N (ADR-XXX)" 형식 inline 참조는 그대로 유지 (역참조 가치)

자체 점검:
```bash
awk '{if (length($0) > 200) print NR": "length($0)"자"}' README.md
```

### 2. `skills/dooray-cli/SKILL.md` 정리

- frontmatter (YAML) 는 그대로
- "빠른 참조 표" 행 — 한 셀이 길면 의미 단위 분할 (단 표 행 자체는 한 줄 유지)
- 자동화 시나리오 단락에 6가지 패턴 적용
- "AI 자동화 시 주의사항" 같은 prose 섹션 점검

dogfooding 효과: AI 에이전트 (Claude Code) 가 자기 자신의 컨텍스트로 더 잘 읽음 — 가독성 + 토큰 효율 양립이 가장 직접적으로 보상되는 docs.

### 3. 전체 6가지 패턴 자체 점검 (final)

```bash
# 6가지 패턴 위반 잔존 검색 — 본 task 전체 산출물 대상
grep -nE "①|②|③|④|⑤|⑥|⑦|⑧|⑨" docs/*.md README.md skills/dooray-cli/SKILL.md CLAUDE.md
# 기대: 0건

# 200자 초과 줄 (코드/표 제외 — 수동 검토)
for f in docs/adr.md docs/code-architecture.md docs/prd.md docs/flow.md docs/data-schema.md README.md skills/dooray-cli/SKILL.md; do
  count=$(awk '{if (length($0) > 200) print NR}' "$f" | wc -l | tr -d ' ')
  echo "$f: $count 행"
done
# 기대: 모든 파일이 phase 시작 전 대비 명백히 감소
```

### 4. index.json 완료 마킹

```bash
sed -i '' 's/"status": "pending"/"status": "completed"/g' tasks/034-chore-docs-readability-backfill/index.json
grep -c '"status": "completed"' tasks/034-chore-docs-readability-backfill/index.json
# 기대: 4 (index + 3 phases)
```

### 5. 최종 commit

```bash
git add README.md skills/dooray-cli/SKILL.md tasks/034-chore-docs-readability-backfill/index.json
git commit -m "$(cat <<'EOF'
chore(docs): backfill README + skills/dooray-cli/SKILL.md to 5-pattern style; complete task 034

CLAUDE.md "docs / ADR 작성 형식" 6가지 패턴 적용 (phase 3/3, final):
- README 사용자 facing 단락
- skills/dooray-cli/SKILL.md 자동화 시나리오 + 빠른 참조 표
- 완료 마킹
EOF
)"
```

## code-review-pitfalls 회피 항목

- **1-11 (sed)**: manual Edit (단 index.json 마킹은 sed OK — 자기참조 무관)
- **개인 식별 정보 사전 점검**: README / SKILL.md 는 외부 노출. CLAUDE.md 의 개인 식별 정보 사전 점검 grep 통과 필수
- **외과적 변경**: 사용 예 코드 블록 그대로, prose 만 손

### 개인 식별 정보 자체 점검 (release skill 룰 답습)

```bash
grep -rnE "tc-ocr|nhnent|nhn-comico|@(nhn|nhnent)\.com" README.md skills/ 2>/dev/null
# 기대: 0건
grep -rnE "[0-9]{15,}" README.md skills/ 2>/dev/null | grep -vE "1234567890123456789|9876543210987654321|<postId>|<pageId>"
# 기대: 0건
```

## 성공 기준

```bash
# cwd: /Users/nhn/personal/dooray-cli

# 1. 모든 대상 파일 enumerated inline 0건
grep -nE "①|②|③|④|⑤|⑥|⑦|⑧|⑨" \
  docs/adr.md docs/code-architecture.md docs/prd.md docs/flow.md docs/data-schema.md \
  README.md skills/dooray-cli/SKILL.md
# 기대: 0건

# 2. index.json 완료
grep -c '"status": "completed"' tasks/034-chore-docs-readability-backfill/index.json
# 기대: 4

# 3. CLAUDE.md / planning SKILL.md 정책 본문 보존
grep -cE "docs / ADR 작성 형식" CLAUDE.md
# 기대: 1
grep -cE "6가지 패턴" .claude/skills/planning/SKILL.md
# 기대: 1

# 4. 토큰 추이 (참고 — 가독성 우선, 토큰은 ±10% 허용)
wc -c docs/adr.md docs/code-architecture.md docs/prd.md docs/flow.md docs/data-schema.md README.md skills/dooray-cli/SKILL.md
```

## 작업 외 금지

- 코드 변경 금지 (phase-01 / phase-02 결과 그대로)
- CLAUDE.md / planning SKILL.md 정책 본문 변경 금지 — 정책 자체는 task 생성 시점 commit 으로 고정
- ADR 신규 추가 금지

## 커밋

위 5번 작업 항목 참조.
