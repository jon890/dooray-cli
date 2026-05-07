# Phase 03 — README badges + secrets 셋업 가이드 + task 완료

## 컨텍스트

phase-01, 02 의 워크플로 2개를 사용자가 발견하고 secret 을 셋업할 수 있도록 README 갱신.

## 변경 파일 (정확)

```bash
# cwd: /Users/nhn/personal/dooray-cli
git diff <base>..HEAD --name-only -- README.md tasks/023-feat-github-ci-claude-review/
```

기대 결과 (총 2 파일):
```
README.md
tasks/023-feat-github-ci-claude-review/index.json
```

## 작업 항목

### 1. `README.md` 상단 — CI 배지 추가

기존 제목/설명 아래 한 줄:

```markdown
[![CI](https://github.com/jon890/dooray-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/jon890/dooray-cli/actions/workflows/ci.yml)
```

### 2. `README.md` — Contributing / CI 섹션 추가

기존 섹션 (예: Development 또는 Contributing) 옆에 GitHub Actions 셋업 안내:

```markdown
## GitHub Actions

이 레포는 두 개의 워크플로를 사용합니다:

### CI (`.github/workflows/ci.yml`)
- 트리거: `main` 으로 push, `main` 대상 PR
- 동작: `pnpm install --frozen-lockfile` → `pnpm test` → `pnpm build` (Node 18, ubuntu-latest)
- 별도 secret 불필요

### Claude code review (`.github/workflows/claude-code-review.yml`)
- 트리거: PR opened, PR 댓글에 `/review` 포함
- 동작: 4 병렬 specialist 에이전트 (TypeScript / Conventions / Security / Architecture) 가 인라인 리뷰 + 요약 댓글 1개 게시
- 필요 secret: `CLAUDE_CODE_OAUTH_TOKEN`

#### Secret 셋업

1. https://github.com/jon890/dooray-cli/settings/secrets/actions 접속
2. `New repository secret` → 이름 `CLAUDE_CODE_OAUTH_TOKEN` + 값 (Anthropic 에서 발급한 OAuth 토큰)
3. PR 을 열거나 PR 댓글에 `/review` 작성하면 자동 실행

#### 비용 / 토큰

각 PR 당 4 specialist 가 모두 `haiku` 모델로 동작 — 평균 PR 1건 당 수십 센트 수준. PR 자동 트리거 비활성화하려면 `claude-code-review.yml` 의 `if:` 조건에서 `github.event_name == 'pull_request'` 분기를 제거하고 `/review` 댓글 트리거만 남길 수 있음.
```

### 3. 마지막 phase — index.json 완료 마킹

```bash
# cwd: /Users/nhn/personal/dooray-cli
sed -i '' 's/"status": "pending"/"status": "completed"/g' tasks/023-feat-github-ci-claude-review/index.json
grep -c '"status": "completed"' tasks/023-feat-github-ci-claude-review/index.json
# 기대: 4
```

### 4. PII 검증 (CLAUDE.md release 게이트 준수)

```bash
# cwd: /Users/nhn/personal/dooray-cli
grep -rnE "tc-ocr|nhnent|nhn-comico|@(nhn|nhnent)\.com" README.md .github/ tasks/023-feat-github-ci-claude-review/ 2>/dev/null
# 기대: 0건
```

## 성공 기준

```bash
# cwd: /Users/nhn/personal/dooray-cli

# 1. CI 배지 추가
grep -nE "actions/workflows/ci\.yml/badge\.svg" README.md
# 기대: 1줄

# 2. GitHub Actions 섹션 추가
grep -cE "Claude code review|CLAUDE_CODE_OAUTH_TOKEN" README.md
# 기대: 2 이상

# 3. workflow 파일 2개 모두 존재 (phase-01, 02 산출)
ls .github/workflows/{ci,claude-code-review}.yml | wc -l | tr -d ' '
# 기대: 2

# 4. index.json 완료 마킹
grep -c '"status": "completed"' tasks/023-feat-github-ci-claude-review/index.json
# 기대: 4

# 5. PII grep 0건
grep -rnE "tc-ocr|nhnent|nhn-comico|@(nhn|nhnent)\.com" README.md .github/ tasks/023-feat-github-ci-claude-review/ 2>/dev/null
# 기대: 0건
```

## 작업 외 금지

- workflow 동작 변경 금지 (phase-01, 02 그대로)
- pre-commit hook 추가 금지 (별도 plan)
- ADR 추가 금지

## 커밋

```bash
# cwd: /Users/nhn/personal/dooray-cli
# branch: feat/023-feat-github-ci-claude-review
git add README.md tasks/023-feat-github-ci-claude-review/index.json
git commit -m "docs: add CI badge + GitHub Actions setup guide; complete task 023

CI 배지 + secrets 셋업 (CLAUDE_CODE_OAUTH_TOKEN) + 트리거 / 비용 안내.
Mark task 023 completed."
```
