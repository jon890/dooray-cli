# Phase 03 — README + skills/dooray-cli/SKILL.md + 완료 마킹

## 변경 파일 (정확)

```bash
# cwd: /Users/nhn/personal/dooray-cli
git diff <base>..HEAD --name-only -- README.md skills/ tasks/027-feat-post-edit-create-cc-to-group/
```

기대 결과 (총 3 파일):
```
README.md
skills/dooray-cli/SKILL.md
tasks/027-feat-post-edit-create-cc-to-group/index.json
```

## 작업 항목

### 1. `README.md` — `post edit` / `post create` 사용 예 갱신

기존 mention/link-task 사용 예 섹션 옆에 cc/to + group 사용 예 추가:

```markdown
#### 참조자(cc) / 담당자(to) 변경 (ADR-025)

\`\`\`bash
# 멤버/그룹 추가 (기존 참조자 유지 + dedupe)
dooray post edit <project> <post-number> \
  --cc 홍길동 --cc-group dev-team \
  --to 김철수

# 기존 참조자 전부 비우고 신규만
dooray post edit <project> <post-number> --cc-clear --cc 홍길동

# 신규 업무 생성 시 그룹 cc 동봉
dooray post create <project> --title "주간 audit" --cc-group dev-team
\`\`\`

interactive ($EDITOR) 모드에서는 위 6개 옵션이 무시되고 stderr 경고가 출력됩니다.
\`--dry-run\` 사용 시 \`--json\` 출력에 \`users: { to, cc }\` 가 포함되어 API 호출 없이 변경 결과 미리보기 가능.
```

### 2. `skills/dooray-cli/SKILL.md` — AI 자동화 시나리오

빠른 참조 표에 신규 옵션 행 추가 (`post edit`, `post create`):

```markdown
| `dooray post edit <project> <number> --cc-group <code>` | 기존 참조자 유지 + 그룹 추가 (dedupe) |
| `dooray post edit <project> <number> --cc-clear --cc <name>` | 참조자 전부 비우고 신규 멤버만 |
| `dooray post create <project> --title "..." --cc-group <code>` | 신규 업무 + 그룹 참조자 |
```

자동화 시나리오 섹션 추가:

```markdown
## 신규 업무 생성 후 그룹 cc 첨부 (ADR-025)

audit 리포트 분석 → 신규 업무 생성 → 후속으로 특정 그룹을 참조에 추가하는 자동화 패턴:

\`\`\`bash
# 1. 신규 업무 생성 (그룹 cc 포함)
POST_ID=$(dooray post create <project> \
  --title "주간 audit 리포트" \
  --body-file ./report.md \
  --cc-group dev-team \
  --json | jq -r '.id')

# 2. (필요 시) 후속으로 cc 추가
dooray post edit --id "$POST_ID" --cc-group qa-team
\`\`\`

dry-run 으로 변경 검증:

\`\`\`bash
dooray post edit --id "$POST_ID" --cc-group qa-team --dry-run --json \
  | jq '.users.cc'
\`\`\`
```

### 3. 마지막 phase — index.json 완료 마킹

```bash
# cwd: /Users/nhn/personal/dooray-cli
sed -i '' 's/"status": "pending"/"status": "completed"/g' tasks/027-feat-post-edit-create-cc-to-group/index.json
grep -c '"status": "completed"' tasks/027-feat-post-edit-create-cc-to-group/index.json
# 기대: 4 (index 1 + phases 3)
```

## 성공 기준

```bash
# cwd: /Users/nhn/personal/dooray-cli

# 1. 빌드 + 테스트 통과
pnpm tsc --noEmit 2>&1 | grep -cE "^src/"
# 기대: 0
pnpm build && pnpm test
# 기대: exit 0

# 2. README + SKILL.md 에 신규 옵션 등장
grep -cE "--cc-group|--cc-clear|--to-group|--to-clear" README.md skills/dooray-cli/SKILL.md
# 기대: 6 이상 (각 파일에 3 이상)

# 3. ADR-025 역참조
grep -nE "ADR-025" README.md skills/dooray-cli/SKILL.md
# 기대: 1 이상

# 4. index.json 완료 마킹
grep -c '"status": "completed"' tasks/027-feat-post-edit-create-cc-to-group/index.json
# 기대: 4

# 5. 개인 식별 정보 grep 0건
grep -rnE "<사내 식별자 패턴 — CLAUDE.md 참조>" README.md skills/ tasks/027-feat-post-edit-create-cc-to-group/ 2>/dev/null | grep -v "사내 Dooray\|NHN 도메인"
# 기대: 0건 (exit 1)
```

## 작업 외 금지

- 코드 변경 금지 (phase-02 결과 그대로)
- ADR / planning docs 변경 금지 (planning 단계 commit `bc92776`, `564870f` 에 이미 반영)
- 옵션 시그니처 변경 금지 (phase-02 확정)

## 커밋

```bash
# cwd: /Users/nhn/personal/dooray-cli
# branch: feat/027-feat-post-edit-create-cc-to-group
git add README.md skills/dooray-cli/SKILL.md tasks/027-feat-post-edit-create-cc-to-group/index.json
git commit -m "docs: document post edit/create cc/to + group options; complete task 027

Issue #54 (phase 3/3, ADR-025): README 사용 예 + SKILL.md 자동화 시나리오
(신규 업무 + 후속 cc-group 첨부). index.json 완료 마킹."
```
