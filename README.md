# dooray-cli

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
dooray project members tc-ocr              # 멤버 목록
dooray project workflows tc-ocr            # 워크플로우 목록
```

### 업무

```bash
dooray post list tc-ocr                    # 업무 목록 (최신순)
dooray post search tc-ocr "키워드"          # 제목 검색
dooray post get tc-ocr 42                  # 업무 상세
dooray post get tc-ocr 42 --json           # JSON 출력
```

### 업무 생성

```bash
dooray post create tc-ocr \
  --title "업무 제목" \
  --body "본문 마크다운" \
  --to "담당자이름" \
  --priority normal

# 본문을 파일에서 읽기 (--body와 --body-file은 동시 사용 불가)
dooray post create tc-ocr --title "업무 제목" --body-file ./content.md
```

### 업무 수정

```bash
# 대화형 ($EDITOR)
dooray post edit tc-ocr 42

# 비대화형 (AI 에이전트 친화)
dooray post edit tc-ocr 42 --title "새 제목" --body "새 본문"

# 본문을 파일에서 읽기
dooray post edit tc-ocr 42 --body-file ./updated.md
```

### 댓글

```bash
dooray post comment list tc-ocr 42
dooray post comment add tc-ocr 42 --body "댓글 내용"
dooray post comment add tc-ocr 42 --body-file ./comment.md
```

### 상태 변경

```bash
dooray post done tc-ocr 42                 # 완료 처리
dooray post workflow tc-ocr 42 "진행 중"    # 워크플로우 변경
```

### 위키

```bash
dooray wiki list                           # 위키 목록
dooray wiki pages tc-ocr                   # 페이지 목록
dooray wiki page get tc-ocr <page-id>      # 페이지 상세
dooray wiki page create tc-ocr --title "..." [--parent <page-id>] [--body "..." | --body-file <path>]
dooray wiki page edit tc-ocr <page-id> --title "새 제목"                   # 제목만 (비대화형)
dooray wiki page edit tc-ocr <page-id> --body "..." | --body-file <path>  # 본문만 (비대화형)
dooray wiki page edit tc-ocr <page-id>                                     # $EDITOR (플래그 없을 때)
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

## 출력 모드

| 플래그 | 설명 | 용도 |
|--------|------|------|
| (없음) | 테이블 출력 | 사람이 읽기 좋음 |
| `--json` | JSON 출력 | 파싱, 파이프라인 |
| `--quiet` | ID만 출력 | 스크립팅 |

```bash
# 파이프라인 예시
dooray post list tc-ocr --json | jq '.[] | select(.priority == "high")'
dooray post list tc-ocr --quiet | xargs -I{} dooray post done tc-ocr {}
```

## AI 에이전트 연동

`skills/dooray-cli/SKILL.md`에 AI 에이전트를 위한 스킬 파일이 포함되어 있습니다. Claude Code 등의 AI 에이전트에서 dooray-cli를 자동으로 활용할 수 있도록 의도→커맨드 매핑, 체이닝 예시, 에러 핸들링 가이드가 포함되어 있습니다.

```bash
# 스킬 파일 복사 (Claude Code 예시)
cp -r skills/dooray-cli ~/.claude/skills/
```

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

## 라이센스

[MIT](LICENSE)
