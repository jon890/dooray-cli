# Phase 02 — README / SKILL.md + 빌드 검증 + 완료 마킹

## 변경 파일 (정확)

```bash
# cwd: /Users/nhn/personal/dooray-cli
git diff <base>..HEAD --name-only -- README.md skills/ tasks/024-feat-post-comment-get/
```

기대 결과 (총 3 파일):
```
README.md
skills/dooray-cli/SKILL.md
tasks/024-feat-post-comment-get/index.json
```

## 작업 항목 (3개)

### 1. `README.md` — 댓글 명령 섹션에 `get` 사용 예 추가

```markdown
# 단일 댓글 조회 (자동화 친화)
dooray post comment get <project> <post-number> <comment-id> --json | jq -r '.body.content'
```

기존 `comment list` / `comment edit` 예시 옆에 자연스럽게 배치.

### 2. `skills/dooray-cli/SKILL.md` — AI 에이전트 자동화 시나리오

```markdown
## 단일 댓글 본문 fetch

`post comment get <project> <post-number> <comment-id> --json` 으로 단일 댓글의 본문 + attachments 를 곧장 fetch. `comment list` 후 jq 필터링 우회 불필요.

본문 patch 흐름:
1. `dooray post comment get <p> <n> <id> --json | jq -r '.body.content' > current.md`
2. (편집)
3. `dooray post comment edit <p> <n> <id> --body-file current.md --no-confirm` (attachment guard 통과)
```

### 3. 마지막 phase — 빌드 검증 + index.json 완료 마킹

```bash
# cwd: /Users/nhn/personal/dooray-cli
pnpm build && pnpm test

sed -i '' 's/"status": "pending"/"status": "completed"/g' tasks/024-feat-post-comment-get/index.json
grep -c '"status": "completed"' tasks/024-feat-post-comment-get/index.json
# 기대: 3 (root + 2 phase)
```

## 성공 기준

```bash
# cwd: /Users/nhn/personal/dooray-cli
pnpm build && pnpm test

grep -cE "post comment get" README.md skills/dooray-cli/SKILL.md
# 기대: 2 이상

grep -c '"status": "completed"' tasks/024-feat-post-comment-get/index.json
# 기대: 3

grep -rnE "<사내 식별자 패턴 — CLAUDE.md 참조>" README.md skills/ tasks/024-feat-post-comment-get/ 2>/dev/null
# 기대: 0건
```

## 작업 외 금지

- 코드 (src/) 변경 금지
- ADR 추가 금지
- 결정 docs (adr.md/code-architecture.md/CLAUDE.md/data-schema.md/flow.md) 변경 금지

## 커밋

```bash
# cwd: /Users/nhn/personal/dooray-cli
# branch: feat/024-feat-post-comment-get
git add README.md skills/dooray-cli/SKILL.md tasks/024-feat-post-comment-get/index.json
git commit -m "docs: document post comment get + complete task 024"
```
