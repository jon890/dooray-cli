# dooray-cli

[![npm version](https://img.shields.io/npm/v/@bifos/dooray-cli.svg)](https://www.npmjs.com/package/@bifos/dooray-cli)
[![npm downloads](https://img.shields.io/npm/dm/@bifos/dooray-cli.svg)](https://www.npmjs.com/package/@bifos/dooray-cli)
[![CI](https://github.com/jon890/dooray-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/jon890/dooray-cli/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/@bifos/dooray-cli.svg)](https://github.com/jon890/dooray-cli/blob/main/LICENSE)

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

아래 순서로 진행합니다:
1. API Endpoint 선택
2. API Key 입력
3. 연결 테스트
4. 메일 설정 (선택)
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
dooray project templates <project>          # 템플릿 목록 (ID / Template Name)
```

> **태그 캐시 갱신**: 이전 버전에서 캐시한 태그가 색상 없이 표시되면 `dooray cache clear` 실행 후 다시 조회하세요.

### 멤버

```bash
dooray member list <project>                  # 프로젝트 멤버 목록 (이름·organizationMemberId)
dooray member get <organizationMemberId>      # 멤버 상세 (cache 우회)

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
| Dooray URL positional | `dooray post get https://x.dooray.com/task/to/<postId>` |
| `--id <postId>` | `dooray post get --id <postId>` |
| `--url <url>` | `dooray post get --url https://x.dooray.com/task/to/<postId>` |

지원 URL 형식 3종 (positional 첫 인자 / `--url` 공통):

- `https://*.dooray.com/task/to/<postId>`
- `https://*.dooray.com/task/<projectId>/<postId>` — 브라우저 주소창 복사본
- `https://*.dooray.com/project/tasks/<postId>` — 프로젝트 업무 목록에서 열기

대상: `post get`/`edit`/`done`/`workflow`, `post comment list`/`add`/`edit`/`delete`, `post file list`/`upload`/`download`/`download-all`/`delete`.
AI 에이전트는 사용자 메시지의 Dooray URL을 그대로 첫 인자로 전달하면 가장 빠르다.

**projectId 직접 입력**:

`member=me` 응답에 없는 프로젝트 (다른 팀 / 권한만 있는 프로젝트) 도 projectId (15+자리 numeric) 를 직접 입력하면 자동으로 cache 우회.

```bash
# 코드 매칭 (기존)
dooray post search <project> "keyword"

# projectId 직접 입력 — member 아닌 프로젝트도 자동화 가능
dooray post search 1234567890123456789 "keyword"
dooray post list 1234567890123456789
dooray member list 1234567890123456789
```

권한 검증은 후속 API 호출 시점 — 권한 없으면 4xx.

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

> mandatory-tag 정책 프로젝트(예: `<project>`)에서는 mandatory 그룹마다 1개 이상 `--tag`로 지정해야 한다.
> 누락 시 클라이언트가 사전 검증으로 후보 목록과 함께 에러 출력.

> **`post create` 출력의 `.id` 는 internal postId (19자리 숫자)입니다.**
> 이 ID 로 후속 조회·수정·댓글 작업을 할 때는 **`--id <postId>`** 를 사용하세요.
> `<project> <업무번호>` 의 번호 자리에 postId 를 넣으면 안내 에러가 발생합니다.
>
> ```bash
> # 생성 후 바로 조회하는 패턴
> POST_ID=$(dooray post create <project> --title "..." --json | jq -r '.id')
> dooray post get --id "$POST_ID"
> dooray post comment add --id "$POST_ID" --body "첫 댓글"
> ```

#### 템플릿 기반 정형 task

```bash
# 프로젝트의 템플릿 목록
dooray project templates <project>

# 템플릿으로 업무 생성 (body/users/tags 자동 채움)
dooray post create <project> --template "릴리스 플랜"

# 사용자 옵션 override — 일부 필드만 다르게
dooray post create <project> --template "릴리스 플랜" --title "v0.9 릴리스 계획" --tag "p0"

# 19자리 templateId 직접 입력
dooray post create <project> --template 1234567890123456789 --title "by id"
```

`interpolation=true` 가 기본 — Dooray 가 `${year}`, `${month}` 같은 시스템 매크로를 응답에서 자동 치환.
사용자 정의 변수 (`--field key=value`) 는 본 release scope 외.

### 업무 수정

```bash
# 대화형 ($EDITOR)
dooray post edit <project> 42

# 비대화형 (AI 에이전트 친화)
dooray post edit <project> 42 --title "새 제목" --body "새 본문"

# 본문을 파일에서 읽기
dooray post edit <project> 42 --body-file ./updated.md
```

#### 본문 변경 시 attachment 보호

`post edit` 와 `post comment edit` 는 본문을 통째로 replace 합니다.
새 본문에 기존 inline attachment markdown(`![](/files/<id>)`)이 빠져 있으면 stderr 에 경고를 띄우고 (y/N) 로 물어봅니다.

자동화 환경 (pipe / non-TTY) 에서는 그대로 abort 됩니다. 의도한 변경이면 `--no-confirm` 으로 다시 실행하세요.

```bash
echo "new body" | dooray post comment edit <project> <post-number> <comment-id> --body - --no-confirm
```

### 댓글

```bash
dooray post comment list <project> 42
dooray post comment add <project> 42 --body "댓글 내용"
dooray post comment add <project> 42 --body-file ./comment.md
```

> table 출력의 Creator 컬럼은 프로젝트 멤버 캐시로 자동 enrich되며, `--json`은 raw 응답을 유지한다.

#### 멘션·내부 링크 자동 삽입

```bash
# 댓글에 멤버·그룹 멘션
dooray post comment add <project> <post-number> \
  --body "주간 리포트 첨부" \
  --mention "홍길동" \
  --mention-group <project>/dev

# 본문에 다른 업무 링크 append
dooray post create <project> \
  --title "이번 주 작업" \
  --body "관련 이슈" \
  --link-task <project>/470

# 송신 전 합성 결과 미리보기
dooray post comment add <project> <post-number> --body "..." --link-task <project>/470 --dry-run
```

> `--mention` / `--mention-group` / `--link-task` / `--dry-run` 은 `post create`, `post edit`, `post comment add`, `post comment edit` 4 명령 모두 지원.
> 이전 버전 캐시는 orgId가 없으므로 첫 호출 시 자동 갱신됩니다 (또는 `dooray cache clear`).

#### 참조자(cc) / 담당자(to) 변경

```bash
# 멤버/그룹 추가 (기존 참조자 유지 + dedupe)
dooray post edit <project> <post-number> \
  --cc 홍길동 --cc-group dev-team \
  --to 김철수

# 기존 참조자 전부 비우고 신규만
dooray post edit <project> <post-number> --cc-clear --cc 홍길동

# 신규 업무 생성 시 그룹 cc 동봉
dooray post create <project> --title "주간 audit" --cc-group dev-team
```

interactive ($EDITOR) 모드에서는 위 6개 옵션이 무시되고 stderr 경고가 출력됩니다.
`post edit --dry-run --json` 사용 시 출력에 `users: { to, cc }` 가 포함되어 API 호출 없이 변경 결과 미리보기 가능.
`post create --dry-run` 은 본문만 출력하며 `users` 는 포함하지 않음.

**그룹 cc / mention 사용 예**:

```bash
# code 부분일치
dooray post create <project> ... --cc-group "개발"

# code 정확 일치
dooray post create <project> ... --mention-group "all"

# 19자리 id 직접 입력 (response shape robustness 또는 code 누락 그룹 회피)
dooray post create <project> ... --cc-group "<19자리 group id>"

# 후보 탐색
dooray project groups <project>
```

```bash
dooray post edit <project> <post-number> --cc-group dev-team --dry-run --json | jq '.users.cc'
# 출력 예: [{ "type": "group", "group": { "projectMemberGroupId": "...", "members": [] } }, ...]
```

#### 생성 후 태그 변경

```bash
# 기존 태그 유지 + 신규 추가 (dedupe)
dooray post edit --id <postId> --tag "<group>: <name>"

# 기존 태그 전부 제거 + 신규만 적용
dooray post edit --id <postId> --tag-clear --tag "<group>: <name>"

# 특정 태그만 제거 (기존 유지)
dooray post edit --id <postId> --tag-remove "<group>: <name>"
```

`--title` / `--body` 없이 단독 호출 가능 — 기존 본문은 자동 재전송.
mandatory tag 그룹은 `post create` 와 동일하게 사전 검증.

#### 상위 업무 변경 (`--parent`)

```bash
# 자식 업무에 부모 지정
dooray post edit <project> <child-number> --title "<원제목>" --parent <project>/<parent-number>

# 다른 부모로 변경
dooray post edit --id <postId> --title "<원제목>" --parent <other-parent-postId>
```

내부적으로 `client.updatePost` 호출 후 별도 `POST .../set-parent-post` endpoint 추가 호출.
**parent 해제 (top-level 화)** 는 Dooray API 가 미지원이라 웹 UI 에서 수동 처리.

interactive ($EDITOR) 모드에서 `--parent` 사용 시 무시 + stderr 경고.
**parent 만 단독 변경하려면 `--title "<원제목>"` 동반 필요** — `post edit` 는 본문 변경(`--title`/`--body`) 동반 시에만 non-interactive 분기로 들어감.
parent 변경은 그 분기 안에서만 수행됨.

`--dry-run --json` 출력의 `parentChange` 필드는 **사용자 입력 원문 그대로** (`<project>/<number>` 또는 raw postId).
resolver 처리 전 미리보기 값이며 실제 호출 대상 `postId` 가 아님.
dry-run 은 API 미호출 원칙을 유지해 `resolvePostRef` 도 건너뜀.

#### `--to` / `--cc` / `--mention` 입력 형식 (자동 분기)

이름 외에도 이메일 / organizationMemberId 직접 입력 가능 — **동명이인 우회 + ID 직접 입력**:

```bash
# 이름 (이전부터 지원, 부분일치)
dooray post create <project> --title "..." --cc 홍길동

# 이메일 (동명이인 우회)
dooray post create <project> --title "..." --cc user@example.com

# organizationMemberId 직접
dooray post create <project> --title "..." --cc 1234567890123456789
```

분기 규칙 (`resolveMember` 자동 판단):
- `^\d{15,}$` — memberId 직접 사용
- `^[^\s@]+@[^\s@]+\.[^\s@]+$` — 이메일, `searchMembers` exact 조회
- 그 외 — 이름 부분일치

`member search --email` 의 인프라 재사용.

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

#### comment get

단일 댓글 ID 로 본문·메타·attachments 를 직접 fetch. `comment list` 후 jq 필터링 없이 바로 사용할 수 있어 자동화 파이프라인에 적합하다.

```bash
# 단일 댓글 조회 (자동화 친화)
dooray post comment get <project> <post-number> <comment-id> --json | jq -r '.body.content'

# ID / URL 모드
dooray post comment get --id <postId> --comment-id <commentId> --json
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

#### 위키 페이지 첨부파일

post 의 `post file` 명령군과 동일 패턴 — `<project> <page-id>` 외에도 `--id`/`--url`/positional URL 지원.

```bash
# 목록 (general 첨부 + inline image 둘 다 표시, type 컬럼)
dooray wiki page file list <project> <page-id>

# 업로드 (기본 general — 페이지 하단 첨부 영역)
dooray wiki page file upload <project> <page-id> --file ./SKILL.md
# stdout: attachFileId + 파일 메타 출력

# 인라인 이미지 업로드 (본문 markdown 은 사용자가 직접 박음)
dooray wiki page file upload <project> <page-id> --file ./diagram.png --type inline_image
# stdout 에 본문 삽입용 markdown snippet 안내

# 다운로드
dooray wiki page file download <project> <page-id> --file-id <id> -o ./

# 페이지 모든 첨부 (files + images) 일괄 다운로드
dooray wiki page file download-all <project> <page-id> -o ./attachments/

# 삭제 (confirm 없이 즉시)
dooray wiki page file delete <project> <page-id> --file-id <id>

# URL 모드 (--id 모드는 --project 동반 필요)
dooray wiki page file list "https://<tenant>.dooray.com/wiki/<wikiId>/<pageId>"
dooray wiki page file upload --id <pageId> --project <project> --file ./README.md
```

`--json` 옵션으로 자동화 파이프라인에서 동일 parse 코드를 사용할 수 있습니다:

```bash
# download — { outputPath, fileName, size }
dooray wiki page file download <project> <page-id> --file-id <id> -o ./ --json

# download-all — { count, succeeded, failed } (부분 실패 시 exit 1)
dooray wiki page file download-all <project> <page-id> -o ./ --json | jq '.failed'

# delete — { fileId, status: "deleted" }
dooray wiki page file delete <project> <page-id> --file-id <id> --json

# upload (general) — res.result raw (--quiet 는 id 만)
dooray wiki page file upload <project> <page-id> --file ./report.pdf --json

# upload (inline_image) — res.result + markdownSnippet 필드 추가 (ADR-031 보강)
dooray wiki page file upload <project> <page-id> --file ./diagram.png --type inline_image --json
# 출력 예:
# {
#   "id": "<id>",
#   "attachFileId": "<attachFileId>",
#   "name": "diagram.png",
#   "size": 12345,
#   "type": "inline_image",
#   "markdownSnippet": "![diagram.png](/wikis/<wikiId>/files/<attachFileId>)"
# }

# 자동화: markdownSnippet 을 jq 로 추출해 본문에 삽입
SNIPPET=$(dooray wiki page file upload <project> <page-id> --file ./diagram.png --type inline_image --json | jq -r '.markdownSnippet')
```

**주의**:
- `upload` 시 multipart 필드 순서 (`type` → `file`) 가 중요.
  클라이언트가 자동으로 강제
- `inline_image` 로 올린 파일은 본문에 markdown 으로 박혀야 위키에서 보임.
  `--json` 의 `markdownSnippet` 을 복사하거나 jq 로 추출해 `dooray wiki page edit` 본문에 직접 추가
- `delete` 는 confirm 없이 즉시 삭제 (실수 방지 책임은 호출자)

#### 위키 페이지 댓글

post 의 `post comment` 명령군과 동일 패턴 — `<project> <page-id>` 외에도 `--id`/`--url`/positional URL 지원.

```bash
# 목록 (최신순)
dooray wiki page comment list <project> <page-id>
dooray wiki page comment list <project> <page-id> --latest 5

# 최신 1건 shortcut
dooray wiki page comment latest <project> <page-id>

# 단일 조회
dooray wiki page comment get <project> <page-id> <comment-id>

# 추가 — interactive ($EDITOR) 또는 옵션
dooray wiki page comment add <project> <page-id>                          # $EDITOR
dooray wiki page comment add <project> <page-id> --body "회의 결정 사항"
dooray wiki page comment add <project> <page-id> --body-file ./note.md
echo "댓글" | dooray wiki page comment add <project> <page-id> --body -

# 수정 — interactive ($EDITOR, 기존 본문 prefill) 또는 옵션
dooray wiki page comment edit <project> <page-id> <comment-id> --body "..."

# 삭제 (confirm 없이 즉시)
dooray wiki page comment delete <project> <page-id> <comment-id>

# URL 모드
dooray wiki page comment list "https://<tenant>.dooray.com/wiki/<wikiId>/<pageId>"
```

**post comment 와의 차이**:
- mention / cc / 받는 사람 미지원 — wiki API 부재
- 첨부 파일 미지원 — wiki comment 전용 endpoint 부재 (페이지 본문 파일은 `wiki page file` 사용)
- 본문은 markdown 그대로 전송 (mimeType 자동)

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

자동화 스크립트에서 `--json` 옵션으로 구조화된 출력을 파이프로 가공할 수 있습니다:

```bash
# download — { outputPath, fileName, size }
dooray post file download <project> <number> --file-id <id> -o ./ --json
# 출력: {"outputPath": "./<fileName>", "fileName": "...", "size": 12345}

# download-all — { count, succeeded, failed } (부분 실패 시 exit 1)
dooray post file download-all <project> <number> -o ./ --json | jq '.failed'
# 출력: [] 또는 [{"fileId": "...", "error": "..."}]

# delete — { fileId, status: "deleted" }
dooray post file delete <project> <number> --file-id <id> --json
# 출력: {"fileId": "...", "status": "deleted"}

# upload — res.result raw (--quiet 는 id 만)
dooray post file upload <project> <number> ./report.pdf --json
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

자동화로 댓글에 인라인 이미지 / 파일을 삽입할 때 사용.
4 명령 (list/upload/download/delete) 모두 `<project> <post-number> <comment-id>` 또는 `--id <postId> --comment-id <logId>` / `--url <url> --comment-id <logId>` 패턴 지원.

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
> post-level files API 와 댓글 본문 PUT 의 합성으로 동작한다. 단일 명령
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

`skills/dooray-cli/SKILL.md`에 AI 에이전트를 위한 스킬 파일이 포함되어 있습니다.
Claude Code 등의 AI 에이전트에서 dooray-cli를 자동으로 활용할 수 있도록 의도→커맨드 매핑, 체이닝 예시, 에러 핸들링 가이드가 포함되어 있습니다.

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

> **개인정보 보호**: `--last` 모드에서 argv는 `--api-key`/`--token`/`Authorization` 등 시크릿 패턴을 자동 마스킹 후 저장합니다. cwd/env는 미저장.

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
- 동작: `pnpm install --frozen-lockfile`, `pnpm test`, `pnpm build` (Node 18, ubuntu-latest)
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

각 PR 당 4 specialist 가 모두 `haiku` 모델로 동작 — 평균 PR 1건 당 수십 센트 수준.
PR 자동 트리거 비활성화하려면 `claude-code-review.yml` 의 `if:` 조건에서 `github.event_name == 'pull_request'` 분기를 제거하고 `/review` 댓글 트리거만 남길 수 있음.

#### Fork PR 제한

GitHub Actions 정책상 fork 에서 열린 PR 은 `secrets.CLAUDE_CODE_OAUTH_TOKEN` 에 접근 못 해 **자동 리뷰가 silent 하게 skip** 된다.
fork 기여자가 리뷰를 받으려면 maintainer 가 PR 댓글에 `/review` 를 작성하여 base repo 컨텍스트로 워크플로를 트리거해야 한다.

## 라이센스

[MIT](LICENSE)
