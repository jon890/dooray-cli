# Phase 02 — Claude code review workflow 신설 (4 specialists, dooray-cli 컨벤션)

## 컨텍스트

fos-blog 의 `claude-code-review.yml` (~447줄) 을 dooray-cli 컨텍스트로 이식. 핵심 인프라 (concurrency 그룹 / 이전 봇 댓글 자동 삭제 / dummy 인라인 댓글 자동 정리 / `/review` 댓글 reaction / claude-code-action@v1.0.111 pin / `--body-file -` HEREDOC 강제 / `'COMMENT_EOF'` single-quoted) 는 그대로 유지하고, **specialist prompt 4개만 dooray-cli 규칙으로 재작성**.

### 원본 파일 (절대경로) — 반드시 이 경로에서 읽어 base 로 사용

```bash
test -f /Users/nhn/personal/fos-blog/.github/workflows/claude-code-review.yml && echo OK
# 기대: OK
```

base 위치: `/Users/nhn/personal/fos-blog/.github/workflows/claude-code-review.yml`

(fos-blog 의 git 메타데이터에서 commit hash 가 필요하면 `git -C /Users/nhn/personal/fos-blog log -1 --format=%H -- .github/workflows/claude-code-review.yml` 로 확인 가능. 본 phase 에서는 현재 시점 working tree 의 파일을 base 로 한다.)

핵심 차이:
- 트리거: PR opened + `/review` 댓글 (fos-blog 와 동일)
- gh pr diff 의 lock 파일 제외: dooray-cli 도 `pnpm-lock.yaml` 제외
- 4 specialists 의 룰셋 교체 — 아래 4 항목 참조

## 변경 파일 (정확)

```bash
# cwd: /Users/nhn/personal/dooray-cli
git diff <base>..HEAD --name-only -- .github/workflows/
```

기대 결과 (총 1 파일, 신규):
```
.github/workflows/claude-code-review.yml
```

## 작업 항목

### 1. `.github/workflows/claude-code-review.yml`

base 구조는 fos-blog 의 `claude-code-review.yml` (1~82행 + 273~447행) 그대로 복사. specialist 프롬프트 (84~272행) 만 아래 4종으로 교체.

복사 시 손대지 않을 부분:
- `if:` 조건 (dependabot/claude bot 제외 + PR open or `/review` 댓글)
- `concurrency` 그룹
- `permissions` 블록 (contents:read / pull-requests:write / issues:write / id-token:write)
- `env: PR_NUMBER` 추출
- `actions/checkout@v6 with fetch-depth: 1` — fos-blog 원본 그대로 유지. (phase-01 의 CI workflow 는 `actions/checkout@v4` 사용. 두 workflow 가 서로 다른 메이저 버전이지만 fos-blog 의 review workflow base 가 v6 으로 작성된 의도이므로 따라간다. 추후 v6 가 표준화되면 phase-01 도 v6 로 통일하는 별도 작업으로 분리)
- `/review` 댓글에 `eyes` reaction 추가 step
- 이전 claude[bot] 일반/인라인 댓글 자동 삭제 step
- `anthropics/claude-code-action@v1.0.111` (회귀 픽스 전 pin 유지)
- 게시 후 dummy 인라인 댓글 자동 정리 step (길이 12 미만 / `^test\d*$` 패턴 / 🔴🟡 마커 부재)
- 결과 reaction (success → +1, failure → -1)
- `claude_args:` 의 `--allowedTools "Agent,Bash(gh pr diff:*),Bash(gh pr view:*),Bash(gh pr comment:*),Bash(gh api:*)" --disallowedTools "Read,Write,Edit,Glob,Grep,LS"`
- `--body-file -` + `<<'COMMENT_EOF'` HEREDOC 강제 규칙
- 4 specialist 모두 `model: "haiku"` 강제 (토큰 절약)

교체 대상 — orchestrator prompt 의 프로젝트 인트로 + 4 specialist 룰셋:

#### orchestrator 인트로 교체

```
당신은 dooray-cli 프로젝트(NHN Dooray REST API CLI, TypeScript + Commander.js, ky HTTP 클라이언트, tsup 빌드, vitest 테스트, ~/.dooray/cache/ 파일별 분리 캐시) 의 코드 리뷰 orchestrator 입니다.
```

`gh pr diff` 의 lock 파일 제외 패턴 그대로 (`pnpm-lock.yaml`, `*.lock`, `*.snap`).

#### Agent 1 — TypeScript & Type Safety (`model: "haiku"`)

확인 항목:
- `any` 타입 사용 (명시적 또는 암시적)
- `as X` 단언 (특히 narrowing 후 무의미한 단언)
- 런타임 nullable 가능한 non-nullable 타입 (optional chaining 누락)
- async 함수의 Promise 반환 타입 부정확
- `DoorayApiResponse<T>` 등 API 타입 정의가 실제 응답 형태와 불일치

#### Agent 2 — Project Conventions (`model: "haiku"`)

🔴 필수 수정:
- HTTP 클라이언트로 `axios` / `node-fetch` / `got` import (ky 외 사용 금지 — ADR-002)
- `console.log` (프로덕션 코드. `console.error` 도 spinner 사용처에서는 stderr 직접 write 가 컨벤션)
- 에러 분기에서 `process.exit(N)` / `throw new DoorayCliError(...)` 누락 → 0 으로 종료 사고
- `~/.dooray/cache/` write 시 atomic 패턴 (writeFile to temp + rename) 미준수
- 개인 식별 정보 노출 금지 항목: `tc-ocr`, `nhnent`, `nhn-comico`, `@nhn*.com`, `kim@example.com` 같은 사내 식별자가 source / docs / commit 본문에 등장 (CLAUDE.md "개인 식별 정보 / 사내 식별자 노출 금지" 표 참조)

🟡 권장 수정:
- 새 commands/ 추가 시 `--id` / `--url` / positional URL 분기 패턴이 `resolvePostInput` 헬퍼와 일치 안 함
- 데이터는 stdout, 진행/에러는 stderr 분리 미준수
- `OutputOptions` 인자 (json/quiet) 미수신 → JSON 모드 회귀

#### Agent 3 — Security (`model: "haiku"`)

🔴 필수 수정:
- API key (Authorization header) 가 로그 / 에러 응답 / spinner 텍스트에 노출
- IMAP / SMTP credential (`config.json`) 가 stdout / stderr / 에러 메시지에 그대로 흘러감
- 외부 입력 (URL / project code / postId) 을 검증 없이 `fetch(...)` URL 에 직접 concat (path injection)
- redirect 처리 시 Auth 헤더 재첨부 누락 (ADR-015) — 307 manual handling 안 했거나 location 헤더 검증 없음
- `feedback` 명령이 GitHub issue body 에 sanitize 안 된 사용자 입력 포함 (ADR-022 의 sanitization 정책)

🟡 권장 수정:
- 사용자 입력을 그대로 shell 명령에 전달 (자식 프로세스 spawn 시 args 배열 사용 권장)
- 캐시 파일 path 가 사용자 입력에서 유래 (`~/.dooray/cache/{userInput}` 같은 패턴)

#### Agent 4 — Architecture & Patterns (`model: "haiku"`)

dooray-cli 의 디렉터리 레이어 (CLAUDE.md 참조):
- `commands/` — Commander.js entrypoint + argv 분기
- `api/client.ts` — ky 호출 + 307 manual redirect (file 업로드/다운로드)
- `resolvers/` — 이름 → ID lookup (모호 시 후보 목록 + 에러)
- `cache/store.ts` — 파일별 atomic write
- `formatters/` — table / JSON / quiet 출력
- `utils/` — 단일 책임 helper (errors / spinner / body-input / mention 등)

🔴 필수 수정:
- commands/ 에서 `ky` 인스턴스를 직접 생성 (api/client.ts 우회)
- resolver 가 모호 매칭 시 silent fallback (항상 후보 목록 + 에러여야 — ADR-008)
- cache write 가 non-atomic (writeFile 직접 — temp + rename 미사용)
- spinner 가 stdout 으로 출력 (process.stderr 분리 위반)

🟡 권장 수정:
- 새 명령이 `--id` / `--url` / positional URL 분기를 `resolvePostInput` 으로 통일 안 하고 자체 분기 작성 (ADR-020)
- 캐시 entry 신규 추가 시 ADR-010 정책 (TTL + 파일 분리 + atomic write) 미준수 — 신규 캐시 종류 추가가 `~/.dooray/cache/{kind}.json` 별도 파일로 분리되었는지, atomic write 패턴 (temp + rename) 을 따르는지, TTL 만료 체크가 read 경로에 있는지
- `formatters/` 패턴 준수 — table/JSON/quiet 분기 누락

### 2. 보안 주의 — secrets / token 관리

workflow 안에서 사용하는 secret:
- `secrets.GITHUB_TOKEN` — 자동 제공 (gh api 호출용)
- `secrets.CLAUDE_CODE_OAUTH_TOKEN` — 사용자가 GitHub repo settings → Secrets and variables → Actions 에 추가해야 함

phase-03 의 README 갱신에서 셋업 안내 추가.

## 성공 기준

```bash
# cwd: /Users/nhn/personal/dooray-cli

# 1. workflow 파일 생성
test -f .github/workflows/claude-code-review.yml && echo OK

# 2. yaml 파싱 가능
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/claude-code-review.yml'))"

# 3. dooray-cli 컨벤션 키워드 포함 (specialist 룰셋 검증)
grep -cE "ky|DoorayCliError|resolvePostInput|atomic|307|ADR-002|ADR-015|ADR-020" .github/workflows/claude-code-review.yml
# 기대: 5 이상

# 4. fos-blog 잔재 없음 (개인 식별 정보 / 웹 스택)
grep -ncE "tc-ocr|nhnent|Drizzle|Next\.js|tailwind|fos-blog" .github/workflows/claude-code-review.yml
# 기대: 0

# 5. 핵심 인프라 보존 — concurrency / dummy 정리 / HEREDOC 강제
grep -cE "concurrency:|cancel-in-progress|--body-file -|COMMENT_EOF|dummy" .github/workflows/claude-code-review.yml
# 기대: 5 이상

# 6. claude-code-action 버전 pin
grep -nE "claude-code-action@v1\.0\.111" .github/workflows/claude-code-review.yml
# 기대: 1줄

# 7. 4 specialist 모두 haiku
grep -cE 'model:\s*"haiku"' .github/workflows/claude-code-review.yml
# 기대: 4
```

## 작업 외 금지

- 자체 review prompt 새로 작성 금지 (fos-blog base 인프라 그대로 + specialist 룰셋만 교체)
- 5번째 specialist 추가 금지 (token 비용)
- haiku → sonnet/opus 변경 금지
- claude-code-action floating tag (`@v1`) 사용 금지 — pin 유지
- README 갱신 금지 — phase-03 에서

## 커밋

```bash
# cwd: /Users/nhn/personal/dooray-cli
# branch: feat/023-feat-github-ci-claude-review
git add .github/workflows/claude-code-review.yml
git commit -m "ci: add Claude code review workflow with 4 dooray-cli specialists

Ported from fos-blog. Specialists rewritten for dooray-cli conventions:
TypeScript / Conventions (ky-only, exitCode, atomic cache, 개인 식별 정보 사전 점검) /
Security (API key, IMAP creds, 307 Auth re-attach) / Architecture
(commands/api/resolvers/cache layering, ADR-002/008/015/020 conformance).
Triggers on PR open + /review comment. claude-code-action pinned to v1.0.111."
```
