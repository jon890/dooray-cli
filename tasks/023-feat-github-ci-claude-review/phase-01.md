# Phase 01 — CI workflow 신설

## 컨텍스트

dooray-cli 는 현재 `.github/` 디렉터리 자체가 없어 CI 가 돌지 않는다. fos-blog 의 `ci.yml` 을 base 로 dooray-cli 스택 (Node 20, pnpm, tsup build, vitest test) 에 맞게 축소.

핵심 차이:
- dooray-cli 는 **lint script 없음** (`pnpm lint` 호출 금지) — `pnpm build` (tsup) 가 타입 검증을 포함하므로 lint 단계 생략
- DB / 사이트 빌드 환경변수 불필요 (env 블록 비움)
- Node 버전: `package.json.engines.node = ">=20"` 기준 Node 20 (LTS)

```bash
# cwd: /Users/nhn/personal/dooray-cli
ls .github/ 2>/dev/null
# 기대: 디렉터리 없음 또는 비어있음
```

## 변경 파일 (정확)

```bash
# cwd: /Users/nhn/personal/dooray-cli
git diff <base>..HEAD --name-only -- .github/
```

기대 결과 (총 1 파일, 신규):
```
.github/workflows/ci.yml
```

## 작업 항목

### 1. `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

env:
  NODE_VERSION: "20"

jobs:
  ci:
    name: Build & Test
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 10

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: "pnpm"

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run tests
        run: pnpm test

      - name: Run build
        run: pnpm build
```

### 2. (선택) pnpm 버전 고정

`pnpm/action-setup@v4` 는 `package.json` 의 `packageManager` 필드를 읽어 버전 고정. 이미 `package.json` 에 `"packageManager": "pnpm@..."` 가 있는지 확인:

```bash
# cwd: /Users/nhn/personal/dooray-cli
jq -r '.packageManager // "MISSING"' package.json
```

실제 환경: `.tool-versions` 의 `pnpm 10.33.0` + `pnpm-lock.yaml` lockfileVersion `9.0` (pnpm 9+ 호환). `package.json` 에 `packageManager` 미존재 → `MISSING`.

따라서 `pnpm/action-setup@v4` 단계에 `with: version: 10` 명시:

```yaml
      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 10
```

(로컬 `.tool-versions` 의 `pnpm 10.33.0` 과 메이저 일치. 본 phase 에서 `package.json.packageManager` 추가는 scope 외 — `version:` 인자만으로 정합성 확보.)

## 성공 기준

```bash
# cwd: /Users/nhn/personal/dooray-cli

# 1. workflow 파일 생성
test -f .github/workflows/ci.yml && echo OK
# 기대: OK

# 2. yaml 파싱 가능 (Python yaml 모듈 사용)
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"
# 기대: 무 출력 (예외 없음)

# 3. dooray-cli 스택 점검 — pnpm/build/test 단계 포함, lint 없음
grep -nE "pnpm (test|build|lint|install)" .github/workflows/ci.yml
# 기대: pnpm install / pnpm test / pnpm build 각 1줄. pnpm lint 0건

# 4. Node 20 명시 (package.json.engines 정합)
grep -nE "NODE_VERSION:\s*\"?20" .github/workflows/ci.yml
# 기대: 1줄

# 5. (실증) 사용자가 PR 을 한 번 열어 CI green 확인 — 본 phase 완료 기준에서는 yaml 정합성까지만
pnpm build && pnpm test
# 기대: exit 0 (CI 가 실행할 동일 명령이 로컬에서도 통과)
```

## 작업 외 금지

- Claude review workflow 추가 금지 — phase-02 에서
- README 갱신 금지 — phase-03 에서
- 다른 OS matrix (windows / macos) 추가 금지 (단순화)
- pnpm install 옵션 변경 (`--no-frozen-lockfile` 등) 금지
- ADR 추가 금지 (자명성 게이트 — 일반적 CI 셋업)

## 커밋

```bash
# cwd: /Users/nhn/personal/dooray-cli
# branch: feat/023-feat-github-ci-claude-review
git add .github/workflows/ci.yml
git commit -m "ci: add GitHub Actions CI (pnpm install + test + build on Node 20)

Adapted from fos-blog. dooray-cli has no lint script — tsup build
provides type validation. push/PR to main triggers."
```
