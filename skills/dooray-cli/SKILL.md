---
name: dooray-cli
description: Dooray 업무 관리 CLI. 프로젝트/업무/댓글/위키 조회·생성·수정. AI 에이전트가 두레이 업무를 자동화할 때 사용.
---

# dooray-cli

NHN Dooray REST API 를 래핑한 CLI 다. 이 파일은 라우터이므로, 작업 영역에 맞는 reference 를 먼저 읽는다.

## 어느 reference 를 읽을지

| 하려는 일 | reference |
| --- | --- |
| 설치·초기 설정, 출력 모드, API 제약, 에러 처리, 캐시, 피드백 등록 | [common.md](references/common.md) |
| 업무 식별·생성·수정·삭제, 참조자·담당자 변경, 첨부 보호, 부모 지정, 태그 | [post.md](references/post.md) |
| 업무 댓글 추가·필터·조회 | [comment.md](references/comment.md) |
| 위키 페이지 조회·트리·삭제, 첨부와 인라인 이미지, 위키 댓글 | [wiki.md](references/wiki.md) |
| 그룹 멘션·cc 판단, 멘션·링크 자동 삽입, Dooray 마크다운 링크 | [mention-link.md](references/mention-link.md) |
| 워크플로우 판단 기준, 정형 task 자동화, 명령 체이닝 | [workflow.md](references/workflow.md) |

## 대상 지정 방법

`post get`/`edit`/`done`/`workflow`, `post comment` 전체, `post file` 전체, `post comment file` 전체,
`wiki page file` 과 `wiki page comment` 전체, 그리고 `wiki page delete` 가 네 가지 형태를 모두 받는다.

- `<project> <number>` — 업무는 번호, 위키는 `<project> <page-id>`
- `--id <postId>` / `--id <pageId>` — 위키는 `--project` 를 함께 줘야 한다 (API 가 page 단독 조회를 지원하지 않는다)
- `--url <url>`
- 첫 인자에 Dooray URL 을 직접

받아들이는 URL 형식은 셋이다.

- `https://*.dooray.com/task/to/<postId>`
- `https://*.dooray.com/task/<projectId>/<postId>` — 브라우저 주소창 복사본
- `https://*.dooray.com/project/tasks/<postId>` — 업무 목록에서 업무를 열었을 때

## 실행 규칙

- 사용자가 Dooray URL 을 줬으면 그대로 첫 인자로 넘긴다 — resolve 단계를 건너뛰어 가장 빠르다
- 구조화 결과가 필요하면 `--json`, 다음 명령에 ID 만 넘길 때는 `--quiet` 를 쓴다
- 조회는 `--json` 으로 먼저 실행해 응답 구조를 확인한 뒤 쓰기 명령으로 넘어간다
- 쓰기 명령은 대상 ID 를 명시하고, 지원하면 `--dry-run` 으로 먼저 확인한다
- 이름 기반 조회(멤버·그룹·워크플로우·태그)는 부분일치를 지원한다. 모호하면 에러와 후보 목록이 나오므로 임의로 고르지 말고 사용자에게 확인한다
- 실패하면 [common.md](references/common.md) 의 에러 처리 표와 대조한다

## 파일 명령의 `--json` 스키마

`post file` 과 `wiki page file` 이 같은 스키마를 쓴다. 한쪽 파싱 코드를 다른 쪽에 그대로 쓸 수 있다.

| 명령 | `--json` | `--quiet` |
| --- | --- | --- |
| `upload` | API 응답의 `result` 원형 | `id` |
| `download` | `{outputPath, fileName, size}` | `outputPath` |
| `download-all` | `{count, succeeded: [{path, fileName}], failed: [{fileId, error}]}` | — |
| `delete` | `{fileId, status: "deleted"}` | `fileId` |

`download-all` 은 일부만 실패해도 나머지를 계속 내려받고 **종료 코드 1** 을 반환한다.
성공과 실패를 갈라 처리해야 하므로 종료 코드만 보고 전체 실패로 판단하지 않는다.

`wiki page file upload --type inline_image` 는 `--json` 에 `markdownSnippet` 이 더 붙는다.
본문에 그대로 넣을 수 있는 markdown 이며, `general` 타입과 `--quiet` 에는 없다.

## 삭제 명령의 확인 동작

여섯 삭제 명령은 같은 안전 확인 정책을 따른다.

| 명령 | 확인 | 자동화 |
| --- | --- | --- |
| `wiki page delete` | 있음 | `-y`, `--yes` |
| `post comment file delete` | 있음 | `-y`, `--yes` |
| `post file delete` | 있음 | `-y`, `--yes` |
| `wiki page file delete` | 있음 | `-y`, `--yes` |
| `post comment delete` | 있음 | `-y`, `--yes` |
| `wiki page comment delete` | 있음 | `-y`, `--yes` |

- TTY 확인은 기본값이 아니오다.
- non-TTY에서 플래그가 없으면 설정 조회나 삭제 API 호출 전에 종료 코드 3으로 중단한다.
- 자동화에서는 `-y` 또는 `--yes`를 반드시 붙인다.

# 의도별 커맨드

자연어 요청을 커맨드로 옮길 때 해당 영역의 절만 본다.

## 설정

| 의도 | 커맨드 |
| --- | --- |
| 초기 설정 (대화형) | `dooray setup` |

## 프로젝트와 멤버

| 의도 | 커맨드 |
| --- | --- |
| 프로젝트 찾기 | `dooray project list --search <keyword>` |
| 개인 프로젝트 목록 | `dooray project list --type private` |
| 프로젝트 멤버 보기 | `dooray project members <project>` 또는 `dooray member list <project>` |
| 프로젝트 멤버 그룹 목록 | `dooray project groups <project>` |
| 프로젝트 태그 목록 | `dooray project tags <project>` |
| 프로젝트 템플릿 목록 | `dooray project templates <project>` |
| 멤버 상세 | `dooray member get <organizationMemberId>` (캐시 우회) |
| organization 전체 멤버 검색 | `dooray member search <keyword>` — 옵션은 [common.md](references/common.md) |

## 업무 조회와 생성

| 의도 | 커맨드 |
| --- | --- |
| 업무 목록 | `dooray post list <project>` |
| 업무 검색 | `dooray post search <project> "<keyword>"` — projectId(15자리 이상 numeric) 를 넣으면 캐시를 우회한다 |
| 업무 상세 | `dooray post get <project> <number>` 또는 `dooray post get --id <postId>` |
| 업무 생성 | `dooray post create <project> --title "..." [--body "..." \| --body-file <path>]` — 담당자는 `--to <name\|email>`, 참조자는 `--cc`, 둘 다 여러 명 가능 |
| 템플릿으로 생성 | `dooray post create <project> --template <name\|id>` — 본문·담당자·태그가 채워지고 사용자 옵션이 우선한다 |
| 제목·본문 수정 | `dooray post edit <project> <number> --title "..." --body "..."` |
| 완료 처리 | `dooray post done <project> <number>` |
| 워크플로우 변경 | `dooray post workflow <project> <number> <workflow>` |

## 업무 메타 변경

자세한 동작은 [post.md](references/post.md) 를 읽는다.

| 의도 | 커맨드 |
| --- | --- |
| 참조자에 그룹 추가 | `dooray post edit <project> <number> --cc-group <code>` — 기존 참조자를 유지하고 추가한다 |
| 참조자 전체 교체 | `dooray post edit <project> <number> --cc-clear --cc <name>` |
| 생성 시 그룹 참조자 | `dooray post create <project> --title "..." --cc-group <code>` |
| 상위 업무 지정·변경 | `dooray post edit <project> <number> --title "<원제목>" --parent <ref>` — `--title` 이 필수이고 해제는 지원하지 않는다 |
| 태그 추가 | `dooray post edit --id <postId> --tag <name>` (반복 가능, 중복 제거) |
| 태그 전체 교체 | `dooray post edit --id <postId> --tag-clear --tag <name>` |
| 태그 제거 | `dooray post edit --id <postId> --tag-remove <name>` |

참조자·담당자 옵션만 지정하면 `$EDITOR`를 열지 않고 기존 제목·본문·태그를 보존한 채 참여자만 바꾼다.

그룹 지정(`--cc-group`, `--mention-group`)은 15자리 이상 numeric 이면 ID 로, 그 외에는 code 부분일치로 찾는다.

## 업무 댓글

| 의도 | 커맨드 |
| --- | --- |
| 댓글 조회 | `dooray post comment list <project> <number>` — 필터는 [comment.md](references/comment.md) |
| 최신 댓글 | `dooray post comment latest <project> <number>` (`-n <N>` 으로 개수 지정) |
| 단일 댓글 | `dooray post comment get <project> <number> <comment-id>` |
| 댓글 추가 | `dooray post comment add <project> <number> --body "..."` |
| 댓글 수정 | `dooray post comment edit <project> <number> <comment-id> --body "..."` |
| 댓글 삭제 | `dooray post comment delete <project> <number> <comment-id>` — 확인 있음, `-y`/`--yes`로 생략 |

## 업무 첨부

`--json` 출력 스키마는 [post.md](references/post.md) 를 읽는다.

| 의도 | 커맨드 |
| --- | --- |
| 첨부 목록 | `dooray post file list <project> <number>` |
| 첨부 다운로드 | `dooray post file download <project> <number> <file-id>` |
| 첨부 일괄 다운로드 | `dooray post file download-all <project> <number>` |
| 첨부 업로드 | `dooray post file upload <project> <number> <file-path>` |
| 첨부 삭제 | `dooray post file delete <project> <number> <file-id>` — 확인 있음, `-y`/`--yes`로 생략 |
| 댓글 첨부 목록 | `dooray post comment file list <project> <number> <comment-id>` |
| 댓글 첨부 업로드 | `dooray post comment file upload <project> <number> <comment-id> <path>` |
| 댓글 첨부 다운로드 | `dooray post comment file download <project> <number> <comment-id> <file-id>` |
| 댓글 첨부 삭제 | `dooray post comment file delete <project> <number> <comment-id> <file-id>` — 확인 있음, `-y`/`--yes`로 생략 |

- 댓글 파일 업로드는 이미지 확장자면 이미지 마크다운을, 그 외에는 일반 링크를 만든다.
- `comment file list`가 비어도 웹 UI 첨부가 없다고 단정하지 말고 `post file list`로 확인한다.

## 위키

| 의도 | 커맨드 |
| --- | --- |
| 위키 목록 | `dooray wiki list` |
| 페이지 목록 | `dooray wiki pages <project>` |
| 페이지 트리 | `dooray wiki tree <project>` (`--depth N` 으로 상한, `--json` 은 flat) |
| 페이지 상세 | `dooray wiki page get <project> <page-id>` |
| 페이지 생성 | `dooray wiki page create <project> --title "..." [--parent <page-id>] [--body "..."]` — `--parent` 를 생략하면 위키 home 아래에 만든다 |
| 페이지 제목 수정 | `dooray wiki page edit <project> <page-id> --title "..."` |
| 페이지 본문 수정 | `dooray wiki page edit <project> <page-id> --body "..."` 또는 `--body-file ./new.md` |
| 페이지 에디터로 수정 | `dooray wiki page edit <project> <page-id>` — 플래그가 없으면 `$EDITOR` 가 열린다 |
| 페이지 삭제 | `dooray wiki page delete <project> <page-id>` — 확인 있음, `-y`/`--yes`로 생략. 하위 페이지는 삭제한 페이지의 부모 아래로 재부착되어 orphan 이 생기지 않는다 |
| 첨부 목록 | `dooray wiki page file list <project> <page-id>` — general 과 inline 을 합쳐 보여준다 |
| 첨부 업로드 | `dooray wiki page file upload <project> <page-id> --file <path> [--type inline_image]` |
| 첨부 다운로드 | `dooray wiki page file download <project> <page-id> --file-id <id> -o <dir>` |
| 첨부 일괄 다운로드 | `dooray wiki page file download-all <project> <page-id> -o <dir>` |
| 첨부 삭제 | `dooray wiki page file delete <project> <page-id> --file-id <id>` — 확인 있음, `-y`/`--yes`로 생략 |
| 댓글 목록 | `dooray wiki page comment list <project> <page-id> [--latest N]` (최신순) |
| 최신 댓글 | `dooray wiki page comment latest <project> <page-id>` |
| 단일 댓글 | `dooray wiki page comment get <project> <page-id> <comment-id>` |
| 댓글 추가 | `dooray wiki page comment add <project> <page-id> --body "..."` (`$EDITOR` fallback) |
| 댓글 수정 | `dooray wiki page comment edit <project> <page-id> <comment-id> --body "..."` |
| 댓글 삭제 | `dooray wiki page comment delete <project> <page-id> <comment-id>` — 확인 있음, `-y`/`--yes`로 생략 |

## 메일

| 의도 | 커맨드 |
| --- | --- |
| 메일 목록 | `dooray mail list` |
| 안 읽은 메일 | `dooray mail list --unread` |
| 제목 검색 | `dooray mail list --search "<keyword>"` |
| 메일 상세 | `dooray mail get <uid>` |
| 메일 발송 | `dooray mail send --to "..." --subject "..." --body "..."` |
| 메일 답장 | `dooray mail reply <uid> --body "..."` |
| 저장된 인증정보 제거 | `dooray mail logout` (비대화형 환경은 `--yes`) |

## 메신저

| 의도 | 커맨드 |
| --- | --- |
| 1:1 다이렉트 메시지 | `dooray messenger send --to "<id\|email>" --body "..."` — `--to` 는 ID 나 이메일만 받고 이름은 지원하지 않는다 |
| 대화방 메시지 | `dooray messenger channel-send --channel "<channelId\|이름>" --body "..."` — 이름으로는 자신이 속한 방만 찾는다 |

## 옵션 이름

`post` 와 `wiki page` 모두 제목은 `--title` 이다.
`post` 의 `--subject` 는 deprecated alias 로 아직 동작하지만 경고가 나온다.
