# dooray-cli

[![CI](https://github.com/jon890/dooray-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/jon890/dooray-cli/actions/workflows/ci.yml)

NHN Dooray REST API를 래핑한 CLI 도구입니다. 터미널과 AI 에이전트 환경에서 Dooray 업무를 관리할 수 있습니다.

> A CLI tool wrapping the NHN Dooray REST API. Manage Dooray tasks from your terminal or AI agent workflows.

## 설치 (Installation)

```bash
npm install -g @bifos/dooray-cli
```

## 초기 설정 (Setup)

대화형 마법사로 한 번에 설정할 수 있습니다:

```bash
dooray setup
```

API Endpoint 선택 → API Key 입력 → 연결 테스트 → 메일 설정(선택)을 순서대로 진행합니다.
API 토큰은 `https://{tenant}.dooray.com/setting/api/token`에서 발급할 수 있습니다.

수동 설정도 가능합니다:

```bash
dooray config set base-url https://api.dooray.com
dooray config set api-key <YOUR_API_TOKEN>
dooray doctor
```

## 사용법 (Usage)

### 프로젝트

```bash
dooray project list                        # 프로젝트 목록 (기본: public)
dooray project list --search ocr           # 코드로 검색
dooray project list --type private         # 개인 프로젝트 목록
dooray project members <project>              # 멤버 목록
dooray project workflows <project>            # 워크플로우 목록
dooray project groups <project>              # 멤버 그룹 목록 (ID / Code)
dooray project tags <project>                # 태그 목록 (ID / Color / Name / Group / Mandatory)
```

> **태그 캐시 갱신**: 이전 버전에서 캐시한 태그가 색상 없이 표시되면 `dooray cache clear` 실행 후 다시 조회하세요.

### 멤버

```bash
dooray member list <project>                  # 프로젝트 멤버 목록 (이름·organizationMemberId)
dooray member get <organizationMemberId>      # 멤버 상세 (cache 우회, ADR-021)

# organization 전체 멤버 검색
dooray member search 홍길동                   # 이름 검색
dooray member search --email user@example.com # 이메일 (정확히 일치)
dooray member search --user-code abc          # 사번 like 검색
dooray member search --user-code-exact abc123 # 사번 exact match
dooray member search 김 --size 50 --page 1   # 페이지네이션
```

### 업무

```bash
dooray post list <project>                    # 업무 목록 (최신순)
dooray post search <project> "키워드"          # 제목 검색
dooray post get <project> 42                  # 업무 상세
dooray post get <project> 42 --json           # JSON 출력
```

#### 업무 식별 방식 (post 하위 16개 명령 공통)

| 방식 | 예시 |
|---|---|
| `<project> <number>` | `dooray post get <project> 42` |
| Dooray URL positional (`/task/to/<postId>`) | `dooray post get https://x.dooray.com/task/to/<postId>` |
| Dooray URL positional (브라우저 주소창 복사본) | `dooray post get https://x.dooray.com/task/<projectId>/<postId>` |
| `--id <postId>` | `dooray post get --id <postId>` |
| `--url <url>` | `dooray post get --url https://x.dooray.com/task/to/...` |

대상: `post get`/`edit`/`done`/`workflow`, `post comment list`/`add`/`edit`/`delete`, `post file list`/`upload`/`download`/`download-all`/`delete`. AI 에이전트는 사용자 메시지의 Dooray URL을 그대로 첫 인자로 전달하면 가장 빠르다 (ADR-020).

### 업무 생성

```bash
dooray post create <project> \
  --title "업무 제목" \
  --body "본문 마크다운" \
  --to "담당자이름" \
  --priority normal

# 본문을 파일에서 읽기 (--body와 --body-file은 동시 사용 불가)
dooray post create <project> --title "업무 제목" --body-file ./content.md

# 메타 옵션: --tag(반복) / --parent / --workflow / --milestone
dooray post create <project> \
  --title "업무 제목" --body "본문" --to "담당자이름" \
  --tag "버그" --tag "긴급" \
  --parent "<project>/337" \
  --workflow "진행 중" \
  --milestone "Sprint 12"
```

> mandatory-tag 정책 프로젝트(예: `<project>`)에서는 mandatory 그룹마다 1개 이상 `--tag`로 지정해야 한다. 누락 시 클라이언트가 사전 검증으로 후보 목록과 함께 에러 출력.

### 업무 수정

```bash
# 대화형 ($EDITOR)
dooray post edit <project> 42

# 비대화형 (AI 에이전트 친화)
dooray post edit <project> 42 --title "새 제목" --body "새 본문"

# 본문을 파일에서 읽기
dooray post edit <project> 42 --body-file ./updated.md
```

### 댓글

```bash
dooray post comment list <project> 42
dooray post comment add <project> 42 --body "댓글 내용"
dooray post comment add <project> 42 --body-file ./comment.md
```

> table 출력의 Creator 컬럼은 프로젝트 멤버 캐시로 자동 enrich되며, `--json`은 raw 응답을 유지한다 (ADR-021).

#### 멘션 (comment add / comment edit)

`--mention <name>` (반복), `--mention-group <code>` (반복)으로 본문 앞에 멘션 마크업을 자동 prepend한다.

```bash
# 멤버 멘션 1명
dooray post comment add P 1 --mention 홍길동 --body "확인 부탁드립니다"

# 여러 명
dooray post comment add P 1 --mention 홍길동 --mention 김철수 --body "..."

# 그룹 멘션
dooray post comment add P 1 --mention-group 개발 --body "검토 요청"

# 멤버 + 그룹 혼합
dooray post comment add P 1 \
  --mention 홍길동 \
  --mention-group 개발 \
  --body "검토 부탁드립니다"

# comment edit에도 동일 옵션 사용 가능
dooray post comment edit P 1 <commentId> --mention 홍길동 --body "수정 내용"
```

> 이전 버전 캐시는 orgId가 없으므로 첫 호출 시 자동 갱신됩니다 (또는 `dooray cache clear`).

#### comment list 필터 옵션

```bash
# 최신 5개 (desc 정렬)
dooray post comment list <project> 42 --latest 5

# 특정 시간 이후 댓글만
dooray post comment list <project> 42 --since 2026-04-27

# 작성자 이름으로 필터 (부분일치)
dooray post comment list <project> 42 --from-author 홍길동

# 오름차순 / 내림차순 정렬
dooray post comment list <project> 42 --sort asc
dooray post comment list <project> 42 --sort desc
dooray post comment list <project> 42 --reverse   # --sort desc alias
```

#### comment latest

최신 댓글 1개(또는 N개)를 빠르게 조회한다.

```bash
# 최신 댓글 1개
dooray post comment latest <project> 42

# 최신 3개
dooray post comment latest <project> 42 -n 3

# URL로도 가능
dooray post comment latest --url <dooray-url>
```

### 상태 변경

```bash
dooray post done <project> 42                 # 완료 처리
dooray post workflow <project> 42 "진행 중"    # 워크플로우 변경
```

### 위키

```bash
dooray wiki list                           # 위키 목록
dooray wiki pages <project>                   # 페이지 목록
dooray wiki page get <project> <page-id>      # 페이지 상세
dooray wiki page create <project> --title "..." [--parent <page-id>] [--body "..." | --body-file <path>]
dooray wiki page edit <project> <page-id> --title "새 제목"                   # 제목만 (비대화형)
dooray wiki page edit <project> <page-id> --body "..." | --body-file <path>  # 본문만 (비대화형)
dooray wiki page edit <project> <page-id>                                     # $EDITOR (플래그 없을 때)
```

### 메일

IMAP을 통해 Dooray 메일을 조회할 수 있습니다. 메일 설정은 `dooray setup`에서 한 번에 진행하거나, 수동으로 설정할 수 있습니다.

```bash
# 수동 설정 (dooray setup 사용 시 불필요)
dooray config set imap-username your@email.com
dooray config set imap-password <IMAP_APP_PASSWORD>

# 메일 조회
dooray mail list                           # 최근 메일 목록
dooray mail list --unread                  # 안읽은 메일만
dooray mail list --search "키워드"          # 제목 검색
dooray mail list --size 50                 # 조회 개수 지정
dooray mail get <uid>                      # 메일 상세
dooray mail get <uid> --json               # JSON 출력

# 메일 발송
dooray mail send --to "user@example.com" --subject "제목" --body "본문"
dooray mail send --to "a@b.com" --cc "c@d.com" --subject "제목" --body-file ./content.md
dooray mail send --to "a@b.com" --subject "HTML 메일" --body "<h1>Hello</h1>" --html

# 메일 답장 (스레드 유지)
dooray mail reply <uid> --body "답장 내용"
```

### 첨부파일

업무에 파일을 첨부하거나, 첨부된 파일을 다운로드할 수 있습니다.

```bash
# 첨부파일 목록
dooray post file list <project> <number>

# 파일 다운로드
dooray post file download <project> <number> <file-id>
dooray post file download <project> <number> <file-id> -o ./downloads

# 전체 파일 다운로드
dooray post file download-all <project> <number> -o ./downloads

# 파일 업로드
dooray post file upload <project> <number> ./report.pdf

# 파일 삭제
dooray post file delete <project> <number> <file-id>
```

URL/`--id`/`--url` 모드에서는 sub-id를 옵션으로 전달:
```bash
dooray post file download --url <url> --file-id <fileId> -o ./downloads
dooray post file delete   --url <url> --file-id <fileId>
dooray post file upload   --url <url> --file ./report.pdf
dooray post comment edit  --url <url> --comment-id <commentId> --body "..."
dooray post comment delete --url <url> --comment-id <commentId>
```

### 댓글 첨부 파일 (`post comment file *`)

자동화로 댓글에 인라인 이미지 / 파일을 삽입할 때 사용. 4 명령 (list/upload/download/delete) 모두 `<project> <post-number> <comment-id>` 또는 `--id <postId> --comment-id <logId>` / `--url <url> --comment-id <logId>` 패턴 지원 (ADR-020).

```bash
# 첨부 목록
dooray post comment file list <project> <post-num> <comment-id>

# 업로드 (post-level files API 로 업로드 + 댓글 본문에 markdown reference append)
dooray post comment file upload <project> <post-num> <comment-id> ./screenshot.png

# 다운로드 (post-level 파일과 동일 — UX 일관성 wrapper)
dooray post comment file download <project> <post-num> <comment-id> <file-id> --out ./out.png

# 삭제 (댓글 본문 markdown 제거 + post-level 파일 삭제, --yes 로 confirm 생략)
dooray post comment file delete <project> <post-num> <comment-id> <file-id> --yes
```

> Dooray REST API 가 댓글 전용 attachment endpoint 를 제공하지 않아 내부적으로
> post-level files API 와 댓글 본문 PUT 의 합성으로 동작 (ADR-024). 단일 명령
> = 단일 파일 — 다중 파일은 호출자가 반복 호출.

## 출력 모드

| 플래그 | 설명 | 용도 |
|--------|------|------|
| (없음) | 테이블 출력 | 사람이 읽기 좋음 |
| `--json` | JSON 출력 | 파싱, 파이프라인 |
| `--quiet` | ID만 출력 | 스크립팅 |

```bash
# 파이프라인 예시
dooray post list <project> --json | jq '.[] | select(.priority == "high")'
dooray post list <project> --quiet | xargs -I{} dooray post done <project> {}
```

## AI 에이전트 연동

`skills/dooray-cli/SKILL.md`에 AI 에이전트를 위한 스킬 파일이 포함되어 있습니다. Claude Code 등의 AI 에이전트에서 dooray-cli를 자동으로 활용할 수 있도록 의도→커맨드 매핑, 체이닝 예시, 에러 핸들링 가이드가 포함되어 있습니다.

```bash
# 스킬 파일 복사 (Claude Code 예시)
cp -r skills/dooray-cli ~/.claude/skills/
```

## 피드백 (GitHub Issue 등록)

`dooray feedback` 명령으로 GitHub issue를 직접 등록할 수 있습니다 (`gh` CLI 위임).

```bash
# 인터랙티브 (제목/본문/라벨 대화형 입력)
dooray feedback

# 논인터랙티브
dooray feedback --title "버그 제목" --body "재현 방법"

# --last 모드 (직전 에러 자동 첨부)
dooray config set track-last-run true   # 1회만, opt-in
dooray feedback --last                  # 직전 명령 + 에러 자동 첨부 + $EDITOR로 의견 추가
dooray feedback --last --title "재현" --body "추가 설명" --dry-run  # 미리보기

# 미리보기 (gh 호출 없이 본문 확인)
dooray feedback --dry-run
```

> **개인정보 보호 (ADR-023)**: `--last` 모드에서 argv는 `--api-key`/`--token`/`Authorization` 등 시크릿 패턴을 자동 마스킹 후 저장합니다. cwd/env는 미저장.

## 캐시

프로젝트, 멤버, 워크플로우, 위키 정보는 `~/.dooray/cache/`에 캐시됩니다.

```bash
dooray cache clear    # 캐시 삭제
dooray doctor         # 캐시 상태 확인
```

## 기술 스택

- TypeScript + Commander.js
- ky (fetch 기반 HTTP 클라이언트)
- @inquirer/prompts (대화형 설정 마법사)
- tsup (esbuild 번들러)
- chalk + cli-table3 (출력 포맷)

## 개발

```bash
pnpm install
pnpm run build
node dist/index.js --help

# 글로벌 링크
pnpm link --global
dooray --help
```

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

#### Fork PR 제한

GitHub Actions 정책상 fork 에서 열린 PR 은 `secrets.CLAUDE_CODE_OAUTH_TOKEN` 에 접근 못 해 **자동 리뷰가 silent 하게 skip** 된다. fork 기여자가 리뷰를 받으려면 maintainer 가 PR 댓글에 `/review` 를 작성하여 base repo 컨텍스트로 워크플로를 트리거해야 한다.

## 라이센스

[MIT](LICENSE)
