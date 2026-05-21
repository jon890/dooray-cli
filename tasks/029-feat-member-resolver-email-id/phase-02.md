# Phase 02 — README + skills/dooray-cli/SKILL.md + 완료 마킹

## 변경 파일 (정확)

```bash
# cwd: /Users/nhn/personal/dooray-cli
git diff <base>..HEAD --name-only -- README.md skills/ tasks/029-feat-member-resolver-email-id/
```

기대 결과 (총 3 파일):
```
README.md
skills/dooray-cli/SKILL.md
tasks/029-feat-member-resolver-email-id/index.json
```

## 작업 항목

### 1. `README.md` — cc/to 사용 예 섹션에 입력 형식 다양화 한 단락 추가

`post edit` / `post create` 의 cc/to 사용 예 근처 (task 027 ADR-025 섹션) 에 입력 형식 자동 분기 한 단락 추가:

```markdown
#### `--to` / `--cc` / `--mention` 입력 형식 (자동 분기)

이름 외에도 이메일 / organizationMemberId 직접 입력 가능 — **동명이인 우회 + ID 직접 입력**:

\`\`\`bash
# 이름 (이전부터 지원, 부분일치)
dooray post create <project> --title "..." --cc 홍길동

# 이메일 (동명이인 우회)
dooray post create <project> --title "..." --cc user@example.com

# organizationMemberId 직접
dooray post create <project> --title "..." --cc 1234567890123456789
\`\`\`

분기 규칙: `^\d{15,}$` → memberId / `^[^\s@]+@[^\s@]+\.[^\s@]+$` → 이메일 / 그 외 → 이름 부분일치. `member search --email` 의 인프라 재사용 (Issue #58).
```

### 2. `skills/dooray-cli/SKILL.md` — AI 자동화 시나리오

빠른 참조 표에 입력 형식 한 줄 추가 + 자동화 시나리오:

```markdown
## 동명이인 회피 — 이메일 / memberId 직접 (Issue #58)

이름이 동일한 멤버가 여러 명이라 `--cc 홍길동` 이 모호로 실패할 때:

\`\`\`bash
# 1) 이메일로 우회
dooray post edit --id "$POST_ID" --cc user.specific@example.com

# 2) 사전에 member search 로 ID 확보 후 직접
MEMBER_ID=$(dooray member search 홍길동 --json | jq -r '.[] | select(.externalEmailAddress=="user.specific@example.com") | .id')
dooray post edit --id "$POST_ID" --cc "$MEMBER_ID"
\`\`\`

\`--to\` / \`--mention\` 동일 분기 (resolveMember 인프라).
```

### 3. 마지막 phase — index.json 완료 마킹

```bash
# cwd: /Users/nhn/personal/dooray-cli
sed -i '' 's/"status": "pending"/"status": "completed"/g' tasks/029-feat-member-resolver-email-id/index.json
grep -c '"status": "completed"' tasks/029-feat-member-resolver-email-id/index.json
# 기대: 3 (index 1 + phases 2)
```

## 성공 기준

```bash
# cwd: /Users/nhn/personal/dooray-cli

# 1. 빌드 + 테스트 통과
pnpm tsc --noEmit 2>&1 | grep -cE "^src/"
# 기대: 0
pnpm build && pnpm test
# 기대: exit 0

# 2. README / SKILL.md 에 이메일·memberId 사용 예
grep -cE "user@example.com|1234567890123456789|동명이인" README.md skills/dooray-cli/SKILL.md
# 기대: 4 이상

# 3. Issue #58 역참조
grep -nE "Issue #58" README.md skills/dooray-cli/SKILL.md
# 기대: 1 이상 (README 또는 SKILL.md)

# 4. index.json 완료 마킹
grep -c '"status": "completed"' tasks/029-feat-member-resolver-email-id/index.json
# 기대: 3

# 5. 개인 식별 정보 grep 0건 (CLAUDE.md release 게이트)
grep -rnE "tc-ocr|nhnent|nhn-comico|@(nhn|nhnent)\.com" README.md skills/ tasks/029-feat-member-resolver-email-id/ 2>/dev/null | grep -vE "사내 Dooray|NHN 도메인"
# 기대: 0건 (exit 1)
```

## 작업 외 금지

- 코드 변경 금지 (phase-01 결과 그대로)
- planning docs (CLAUDE.md / code-architecture.md / flow.md) 변경 금지 — `782543b` 으로 이미 반영
- 분기 규칙 변경 금지 (phase-01 확정)

## 커밋

```bash
# cwd: /Users/nhn/personal/dooray-cli
# branch: feat/029-feat-member-resolver-email-id
git add README.md skills/dooray-cli/SKILL.md tasks/029-feat-member-resolver-email-id/index.json
git commit -m "docs: document resolveMember email/memberId 분기; complete task 029

Issue #58 (phase 2/2): README 사용 예 + SKILL.md 동명이인 우회 시나리오.
index.json 완료 마킹."
```
