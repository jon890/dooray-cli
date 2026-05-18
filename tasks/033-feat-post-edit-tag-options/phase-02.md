# Phase 02 — README + skills/dooray-cli/SKILL.md + 완료 마킹

## 변경 파일

기대 결과 (총 3 파일):
```
README.md
skills/dooray-cli/SKILL.md
tasks/033-feat-post-edit-tag-options/index.json
```

## 작업 항목

### 1. `README.md` — 사용 예 추가

기존 `dooray post edit` 섹션 옆에 태그 옵션 예 추가:

```markdown
#### 생성 후 태그 변경 (Issue #66)

\`\`\`bash
# 기존 태그 유지 + 신규 추가 (dedupe)
dooray post edit --id <postId> --tag "<group>: <name>"

# 기존 태그 전부 제거 + 신규만 적용
dooray post edit --id <postId> --tag-clear --tag "<group>: <name>"

# 특정 태그만 제거 (기존 유지)
dooray post edit --id <postId> --tag-remove "<group>: <name>"
\`\`\`

`--title` / `--body` 없이 단독 호출 가능 — 기존 본문은 자동 재전송. mandatory tag 그룹은
`post create` 와 동일하게 사전 검증 (ADR-019).
```

### 2. `skills/dooray-cli/SKILL.md` — 자동화 시나리오

빠른 참조 표에 행 추가:

```markdown
| `dooray post edit --id <postId> --tag <name>` | 태그 추가 (반복, dedupe) |
| `dooray post edit --id <postId> --tag-clear --tag <name>` | 태그 전체 교체 |
| `dooray post edit --id <postId> --tag-remove <name>` | 특정 태그 제거 |
```

자동화 시나리오:

```markdown
## 태그 사후 분류 자동화 (Issue #66)

분류 분석 결과를 받아 태그를 재분류하는 자동화는 단독 호출 패턴이 효율적:

\`\`\`bash
# 분석 스크립트가 분류한 태그 이름을 cli 로 적용 — body fetch 불요
POST_ID=$(...)
CATEGORY=$(...)
dooray post edit --id "$POST_ID" --tag "분류: $CATEGORY"
\`\`\`

태그만 변경하는 시나리오에서 `--title` / `--body` 강제 없음. mandatory 그룹은 친절한 에러 메시지로 안내 (ADR-019).
```

### 3. 마지막 phase — index.json 완료 마킹

```bash
# cwd: /Users/nhn/personal/dooray-cli
sed -i '' 's/"status": "pending"/"status": "completed"/g' tasks/033-feat-post-edit-tag-options/index.json
grep -c '"status": "completed"' tasks/033-feat-post-edit-tag-options/index.json
# 기대: 3 (index + 2 phases)
```

## 성공 기준

```bash
# cwd: /Users/nhn/personal/dooray-cli

# 1. 빌드 + 테스트 통과
pnpm tsc --noEmit 2>&1 | grep -cE "^src/"
# 기대: 0
pnpm build && pnpm test
# 기대: exit 0

# 2. README / SKILL.md 에 신규 옵션
grep -cE "post edit.*--tag" README.md skills/dooray-cli/SKILL.md
# 기대: 3 이상

# 3. ADR-019 역참조
grep -nE "ADR-019" README.md skills/dooray-cli/SKILL.md
# 기대: 1 이상

# 4. index.json 완료 마킹
grep -c '"status": "completed"' tasks/033-feat-post-edit-tag-options/index.json
# 기대: 3

# 5. PII 0건
grep -rnE "tc-ocr|nhnent|nhn-comico|@(nhn|nhnent)\.com" README.md skills/ tasks/033-feat-post-edit-tag-options/ 2>/dev/null | grep -vE "사내 Dooray|NHN 도메인"
# 기대: 0건 (exit 1)
```

## 작업 외 금지

- 코드 변경 금지 (phase-01 결과 그대로)
- planning docs (CLAUDE.md / adr.md / code-architecture.md / prd.md / flow.md / data-schema.md) 변경 금지
- cc-group 단독 호출 허용 안내 추가 금지 — 별도 follow-up issue scope

## 커밋

```bash
# cwd: /Users/nhn/personal/dooray-cli
# branch: feat/033-post-edit-tag-options
git add README.md skills/dooray-cli/SKILL.md tasks/033-feat-post-edit-tag-options/index.json
git commit -m "docs: document post edit --tag options; complete task 033

Issue #66 (phase 2/2, ADR-019 확장): README 사용 예 + SKILL.md 자동화 시나리오
(태그 사후 분류 자동화). 완료 마킹."
```
