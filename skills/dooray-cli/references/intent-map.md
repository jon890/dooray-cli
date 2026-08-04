# intent-map

자연어 요청을 dooray-cli 커맨드로 변환할 때 참고하는 마스터 표.

## 의도 → 커맨드 매핑

자연어 요청을 커맨드로 변환할 때 아래 표를 참고한다.

> **공통 (post 하위 16개 명령)**: 아래 명령은 `<project> <number>` 외에도 `--id <postId>`, `--url <url>`, 또는 첫 인자에 Dooray URL 을 직접 받는다.
> `post get`/`edit`/`done`/`workflow`, `post comment list`/`add`/`edit`/`delete`, `post file list`/`upload`/`download`/`download-all`/`delete`, `post comment file list`/`upload`/`download`/`delete`.
>
> 지원 URL 형식 3종 (positional 첫 인자 / `--url` 공통):
> - `https://*.dooray.com/task/to/<postId>`
> - `https://*.dooray.com/task/<projectId>/<postId>` — 브라우저 주소창 복사본
> - `https://*.dooray.com/project/tasks/<postId>` — 프로젝트 업무 목록 → 업무 열기
>
> **사용자가 URL을 줬으면 그대로 첫 인자로 전달**하는 것이 가장 빠른 경로 (resolve 단계 단축).

| 의도 | 커맨드 |
|------|--------|
| 초기 설정 (대화형) | `dooray setup` |
| 프로젝트 찾기 | `dooray project list --search <keyword>` |
| 개인 프로젝트 목록 | `dooray project list --type private` |
| 프로젝트 멤버 보기 | `dooray project members <project>` 또는 `dooray member list <project>` (이름·organizationMemberId) |
| 프로젝트 멤버 그룹 목록 | `dooray project groups <project>` (ID / Code) |
| 프로젝트 태그 목록 | `dooray project tags <project>` (ID / Color / Name / Group / Mandatory) |
| 프로젝트 템플릿 목록 | `dooray project templates <project>` (id / templateName) |
| 멤버 상세 (organizationMemberId) | `dooray member get <organizationMemberId>` (cache 우회) |
| organization 전체 멤버 검색 | `dooray member search <keyword>` (이름 기본), `--email`(이메일 exact), `--user-code`(사번 like), `--user-code-exact`(사번 exact), `--page`/`--size` |
| 업무 목록 조회 | `dooray post list <project>` |
| 업무 검색 | `dooray post search <project|projectId> "<keyword>"` — projectId (15+자리 numeric) 직접 입력 시 cache 우회 |
| 업무 상세 보기 | `dooray post get <project> <number>` (번호) / `dooray post get --id <postId>` (internal ID) |
| 업무 생성 | `dooray post create <project> --title "..." [--body "..." \| --body-file <path>]` (`--tag`/`--parent`/`--workflow`/`--milestone` 지원) |
| 템플릿 기반 업무 생성 | `dooray post create <project> --template <name\|id>` — body/users/tags 자동 채움 (사용자 옵션 우선 override) |
| 업무 제목/본문 수정 | `dooray post edit <project> <number> --title "..." --body "..."` 또는 `--body-file <path>` |
| 업무 완료 처리 | `dooray post done <project> <number>` |
| 업무 워크플로우 변경 | `dooray post workflow <project> <number> <workflow>` |
| 댓글 조회 | `dooray post comment list <project> <number>` (`--sort`, `--reverse`, `--latest`, `--since`, `--from-author` 필터. table: Creator 자동 채움, `--json`: raw) |
| 최신 댓글 조회 | `dooray post comment latest <project> <number>` — 최신 댓글 1개 빠른 조회. `-n <N>`으로 N개 지정 |
| 단일 댓글 조회 | `dooray post comment get <project> <number> <comment-id>` — 본문·메타·attachments 직접 fetch. `--id`/`--url` + `--comment-id` 모드 지원 |
| 댓글 추가 | `dooray post comment add <project> <number> --body "..."` 또는 `--body-file <path>` |
| 댓글 수정 | `dooray post comment edit <project> <number> <comment-id> --body "..."` 또는 `--body-file <path>` |
| 댓글 삭제 | `dooray post comment delete <project> <number> <comment-id>` |
| 위키 목록 | `dooray wiki list` |
| 위키 페이지 목록 | `dooray wiki pages <project>` |
| 위키 페이지 트리 | `dooray wiki tree <project>` (계층 트리, `--depth N` 상한, `--json` 은 flat) |
| 위키 페이지 상세 | `dooray wiki page get <project> <page-id>` |
| 위키 페이지 생성 | `dooray wiki page create <project> --title "..." [--parent <page-id>] [--body "..."]` (--parent 생략 시 위키 home 페이지 아래 생성) |
| 위키 페이지 수정 (제목) | `dooray wiki page edit <project> <page-id> --title "..."` |
| 위키 페이지 수정 (본문) | `dooray wiki page edit <project> <page-id> --body "..."` 또는 `--body-file ./new.md` |
| 위키 페이지 수정 (에디터) | `dooray wiki page edit <project> <page-id>` (플래그 없으면 $EDITOR 열림) |
| 위키 페이지 삭제 | `dooray wiki page delete <project> <page-id>` (y/N 확인 기본, `--yes`로 자동화 시 생략. 하위 페이지는 상위 페이지로 재부착) |
| 위키 페이지 첨부 목록 | `dooray wiki page file list <project> <page-id>` (general + inline 합산, type 컬럼) |
| 위키 페이지 첨부 업로드 | `dooray wiki page file upload <project> <page-id> --file <path> [--type inline_image]` (multipart `type` 필드를 `file` 앞에 전송) |
| 위키 페이지 첨부 다운로드 | `dooray wiki page file download <project> <page-id> --file-id <id> -o <dir>` |
| 위키 페이지 첨부 일괄 다운로드 | `dooray wiki page file download-all <project> <page-id> -o <dir>` (files + images 전부) |
| 위키 페이지 첨부 삭제 | `dooray wiki page file delete <project> <page-id> --file-id <id>` (confirm 없음) |
| 위키 페이지 댓글 목록 | `dooray wiki page comment list <project> <page-id> [--latest N]` (최신순) |
| 위키 페이지 최신 댓글 | `dooray wiki page comment latest <project> <page-id>` |
| 위키 페이지 댓글 조회 | `dooray wiki page comment get <project> <page-id> <comment-id>` |
| 위키 페이지 댓글 추가 | `dooray wiki page comment add <project> <page-id> --body "..."` ($EDITOR fallback) |
| 위키 페이지 댓글 수정 | `dooray wiki page comment edit <project> <page-id> <comment-id> --body "..."` |
| 위키 페이지 댓글 삭제 | `dooray wiki page comment delete <project> <page-id> <comment-id>` (confirm 없음) |
| 메일 목록 조회 | `dooray mail list` |
| 안읽은 메일 | `dooray mail list --unread` |
| 메일 제목 검색 | `dooray mail list --search "<keyword>"` |
| 메일 상세 | `dooray mail get <uid>` |
| 메일 발송 | `dooray mail send --to "..." --subject "..." --body "..."` |
| 메일 답장 | `dooray mail reply <uid> --body "..."` |
| 저장된 메일 인증정보 제거 | `dooray mail logout` (비대화형 환경: `--yes`) |
| 메신저 1:1 다이렉트 메시지 | `dooray messenger send --to "<id\|email>" --body "..."` (`--to`는 id/이메일만, 이름 미지원) |
| 메신저 대화방 메시지 | `dooray messenger channel-send --channel "<channelId\|이름>" --body "..."` (이름은 자신이 속한 방만 검색) |
| 첨부파일 목록 | `dooray post file list <project> <number>` |
| 첨부파일 다운로드 | `dooray post file download <project> <number> <file-id>` |
| 전체 첨부파일 다운로드 | `dooray post file download-all <project> <number>` |
| 첨부파일 업로드 | `dooray post file upload <project> <number> <file-path>` |
| 첨부파일 삭제 | `dooray post file delete <project> <number> <file-id>` |
| file 명령군 자동화 파싱 | `dooray post file <verb> ... --json` — `download` = `{outputPath,fileName,size}`, `download-all` = `{count,succeeded,failed}` (부분 실패 시 exit 1), `delete` = `{fileId,status}`, `upload` = `res.result` raw |
| 댓글 첨부 목록 | `dooray post comment file list <project> <number> <comment-id>` |
| 댓글 파일 업로드 | `dooray post comment file upload <project> <number> <comment-id> <path>` |
| 댓글 파일 다운로드 | `dooray post comment file download <project> <number> <comment-id> <file-id>` |
| 댓글 파일 삭제 | `dooray post comment file delete <project> <number> <comment-id> <file-id> --yes` |
| 참조자(cc) 멤버/그룹 추가 | `dooray post edit <project> <number> --cc-group <code>` — 기존 참조자 유지 + 그룹 추가 (dedupe) |
| 참조자 전체 교체 | `dooray post edit <project> <number> --cc-clear --cc <name>` — 기존 참조자 비우고 신규 멤버만 |
| 신규 업무 + 그룹 cc | `dooray post create <project> --title "..." --cc-group <code>` — 생성 시 그룹 참조자 포함 |
| `--cc-group <code\|id>` / `--mention-group <code\|id>` | 그룹 매칭 — 15+자리 numeric → id 직접 / 그 외 → code matchByName (부분일치) |
| 상위 업무 설정/변경 | `dooray post edit <project> <number> --title "<원제목>" --parent <ref>` (`<ref>`: `<project>/<number>` 또는 raw postId. `--title` 필수, unset 미지원) |
| `dooray post edit --id <postId> --tag <name>` | 태그 추가 (반복, dedupe) |
| `dooray post edit --id <postId> --tag-clear --tag <name>` | 태그 전체 교체 |
| `dooray post edit --id <postId> --tag-remove <name>` | 특정 태그 제거 |

> **제목 옵션 네이밍**: `post` 와 `wiki page` 모두 `--title` 표준. `post`의 `--subject`는 deprecated alias로 당분간 동작하되, 새 코드에서는 `--title` 사용을 권장.
