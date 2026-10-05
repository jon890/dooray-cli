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
| 업무 식별·생성·수정·삭제, 목록 거르기, 본문 일부 치환, 참조자·담당자 변경, 첨부 보호, 부모 지정, 태그 | [post.md](references/post.md) |
| 업무 댓글 추가·필터·조회 | [comment.md](references/comment.md) |
| 위키 페이지 조회·트리·삭제, 본문 일부 치환, 첨부와 인라인 이미지, 위키 댓글 | [wiki.md](references/wiki.md) |
| 그룹 멘션·cc 판단, 멘션·링크 자동 삽입, Dooray 마크다운 링크 | [mention-link.md](references/mention-link.md) |
| 워크플로우 판단 기준, 정형 task 자동화, 명령 체이닝 | [workflow.md](references/workflow.md) |
| 메일 원본 선택, 답장 전 확인 | [mail.md](references/mail.md) |
| 메신저 대화방 찾기, 메시지 읽기, 스레드 보고 | [messenger.md](references/messenger.md) |
| 캘린더 기간 조회, 일정 상세, 참석자 | [calendar.md](references/calendar.md) |

## 대상 지정 방법

`post get`/`edit`/`replace`/`done`/`workflow`, `post comment` 전체, `post file` 전체, `post comment file` 전체,
`wiki page get` 과 `wiki page edit` 과 `wiki page replace`, `wiki page file` 과 `wiki page comment` 전체,
그리고 `wiki page delete` 와 `wiki page move` 가 네 가지 형태를 모두 받는다.

- `<project> <number>` — 업무는 번호, 위키는 `<project> <page-id>`
- `--id <postId>` / `--id <pageId>` — 위키는 `--project` 없이도 조회된다. 함께 주면 wikiId 를 해석하는 호출을 한 번 아낀다
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
- 긴 본문의 일부만 고칠 때는 `edit --body` 로 전문을 다시 보내지 말고 `post replace`/`wiki page replace` 로 바꿀 구간만 보낸다
- 이름 기반 조회(멤버·그룹·워크플로우·태그)는 부분일치를 지원한다. 모호하면 에러와 후보 목록이 나오므로 임의로 고르지 말고 사용자에게 확인한다
- 멤버를 이름으로 찾는 것은 그 프로젝트의 멤버로 한정된다. 비멤버는 이메일이나 memberId 로 지정한다 — [post.md](references/post.md)
- 실패하면 [common.md](references/common.md) 의 에러 처리 표와 대조한다

## 파일 명령의 `--json` 스키마

`post file` 과 `wiki page file` 은 출력 처리 방식이 같고, 서버가 돌려주는 필드는 다를 수 있다.
한쪽 파싱 코드를 다른 쪽에 옮길 때 필드가 그대로인지 확인한다.

| 명령 | `--json` | `--quiet` |
| --- | --- | --- |
| `upload` | `post file upload` 는 `{"id": "<file-id>"}` 하나다.<br>`wiki page file upload` 는 이름과 크기를 함께 내려준다 | `id` |
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
| 프로젝트 태그 목록 | `dooray project tags <project>` — 프로젝트 코드가 `list`·`create`·`group` 과 같으면 `dooray project tags list <project>` |
| 태그 만들기 | `dooray project tags create <project> --name "<그룹>:<태그>" [--color <hex>]` — 그룹명 생략 가능 |
| 태그 그룹 속성 변경 | `dooray project tags group <project> "<그룹>" [--mandatory] [--select-one]` — 해제는 `--no-` 접두 |
| 프로젝트 템플릿 목록 | `dooray project templates <project>` |
| 멤버 상세 | `dooray member get <organizationMemberId>` (캐시 우회) |
| organization 전체 멤버 검색 | `dooray member search <keyword>` — 옵션은 [common.md](references/common.md) |

## 업무 조회와 생성

| 의도 | 커맨드 |
| --- | --- |
| 업무 목록 | `dooray post list <project>` — `--all` 로 모든 페이지를 이어 받는다 |
| 태그로 거르기 | `dooray post list <project> --tag "<이름>"` — 반복 가능하고, 여러 번 주면 그 태그를 모두 가진 업무만 온다 |
| 사람으로 거르기 | `dooray post list <project> --from me` — 등록자 `--from`, 담당자 `--to`, 참조자 `--cc`. 옵션마다 한 명이고 `me`·id·이메일·이름을 받는다 |
| 하위 업무만 | `dooray post list <project> --parent <number>` — 이 프로젝트의 업무 번호다. `<project>/<number>` 와 postId 도 받는다 |
| 기간으로 거르기 | `dooray post list <project> --created 2026-09-01~2026-09-30` — 수정 기간은 `--updated`. `A~`, `"~B"`(따옴표 필수), `prev-7d` 도 받는다 |
| 정렬 바꾸기 | `dooray post list <project> --order -postUpdatedAt` — `createdAt`·`postUpdatedAt`·`postDueAt`, `-` 는 내림차순. 기본 `-createdAt` |
| 업무 검색 | `dooray post search <project> "<keyword>"` — projectId(15자리 이상 numeric) 를 넣으면 캐시를 우회한다 |
| 업무 상세 | `dooray post get <project> <number>` 또는 `dooray post get --id <postId>` — 일반 출력에는 태그가 이름으로 나온다 |
| 태그 이름까지 받기 | `dooray post get <project> <number> --json --with-tag-names` — `--json` 의 `tags[]` 에 `name` 을 채운다. 하나라도 못 채우면 멈춘다 |
| 업무 생성 | `dooray post create <project> --title "..." [--body "..." \| --body-file <path>]` — 담당자는 `--to <name\|email>`, 참조자는 `--cc`, 둘 다 여러 명 가능 |
| 템플릿으로 생성 | `dooray post create <project> --template <name\|id>` — 본문·담당자·태그가 채워지고 사용자 옵션이 우선한다 |
| 제목·본문 수정 | `dooray post edit <project> <number> --title "..." --body "..."` — 본문 전체를 바꾼다. 본문 형식이 기존과 다르면 `--mime-type` 을 함께 준다 |
| 본문 일부만 수정 | `dooray post replace <project> <number> --old "..." --new "..."` — 긴 본문에서 몇 군데만 고칠 때 `edit` 대신 쓴다. 여러 줄은 `--old-file`/`--new-file`, 먼저 `--dry-run` 으로 확인. 규칙은 [post.md](references/post.md) |
| 완료 처리 (업무 상태를 완료로) | `dooray post done <project> <number>` |
| 워크플로우 변경 (업무 상태·진행 상태 변경) | `dooray post workflow <project> <number> <workflow>` |

## 본문 형식

업무와 댓글과 위키 페이지는 본문 형식이 `text/x-markdown` 이거나 `text/html` 이다.
`dooray post get ... --json` 의 `body.mimeType` 으로 확인한다.

`post edit`, `post comment edit`, `wiki page edit` 는 수정할 때 기존 형식을 그대로 유지한다.
그래서 **주는 본문의 형식이 기존과 다르면 `--mime-type` 을 반드시 함께 준다.**
빠뜨리면 마크다운 본문이 `text/html` 로 저장되어 웹에서 `## 제목` 과 표 구분자가 문자 그대로 보인다.

```bash
dooray post get <project> 42 --json | jq .body.mimeType    # "text/html"

# HTML 글에 마크다운 본문을 넣을 때
dooray post edit <project> 42 --body-file notes.md --mime-type text/x-markdown

# 본문은 그대로 두고 형식만 되돌릴 때
dooray post edit <project> 42 --mime-type text/html
```

값은 `text/x-markdown` 과 `text/html` 둘뿐이고 다른 값은 거부된다.
본문을 바꾸지 않고 형식만 바꾸면 CLI 가 본문을 변환하지 않는다는 경고를 stderr 로 낸다.

## 업무 메타 변경

자세한 동작은 [post.md](references/post.md) 를 읽는다.

| 의도 | 커맨드 |
| --- | --- |
| 참조자에 그룹 추가 | `dooray post edit <project> <number> --cc-group <code>` — 기존 참조자를 유지하고 추가한다 |
| 참조자 전체 교체 | `dooray post edit <project> <number> --cc-clear --cc <name>` |
| 담당자 전체 교체 | `dooray post edit <project> <number> --to-clear --to <name>` |
| 생성 시 그룹 참조자 | `dooray post create <project> --title "..." --cc-group <code>` |
| 상위 업무 지정·변경 | `dooray post edit <project> <number> --parent <ref>` — 해제는 지원하지 않는다 |
| 태그 추가 | `dooray post edit --id <postId> --tag <name>` (반복 가능, 중복 제거) |
| 태그 전체 교체 | `dooray post edit --id <postId> --tag-clear --tag <name>` |
| 태그 제거 | `dooray post edit --id <postId> --tag-remove <name>` |

태그를 붙인 뒤 들어갔는지 확인하려면 두 명령을 잇는다.

```bash
dooray post edit <project> <number> --tag "<이름>"
dooray post get <project> <number> --json --with-tag-names
```

`--with-tag-names` 없이 `--json` 만 주면 응답이 그대로 나와 태그에 `id` 만 들어 있다.

참조자·담당자 옵션만 지정하면 `$EDITOR`를 열지 않고 기존 제목·본문·태그를 보존한 채 참여자만 바꾼다.

그룹 지정(`--cc-group`, `--mention-group`)은 15자리 이상 numeric 이면 ID 로, 그 외에는 code 부분일치로 찾는다.

본문 형식이 `text/html` 인 업무와 댓글에서는 `--mention`, `--mention-group`, `--link-task` 가 종료 코드 3 으로 멈춘다.
그 형식의 표기가 확인되지 않아서다. `--mime-type text/x-markdown` 으로 형식을 바꾸면 쓸 수 있다.

## 업무 댓글

| 의도 | 커맨드 |
| --- | --- |
| 댓글 조회 | `dooray post comment list <project> <number>` — 필터는 [comment.md](references/comment.md) |
| 최신 댓글 | `dooray post comment latest <project> <number>` (`-n <N>` 으로 개수 지정) |
| 단일 댓글 | `dooray post comment get <project> <number> <comment-id>` |
| 댓글 추가 | `dooray post comment add <project> <number> --body "..."` |
| 댓글 수정 | `dooray post comment edit <project> <number> <comment-id> --body "..."` — 본문 형식이 기존과 다르면 `--mime-type` 을 함께 준다 |
| 댓글 삭제 | `dooray post comment delete <project> <number> <comment-id>` — 확인 있음, `-y`/`--yes`로 생략. `--json` 은 `{"commentId": "...", "status": "deleted"}` |

내부 ID 를 positional 자리에 넣으면 입력 오류가 나지만, 그 오류가 `--id` 를 쓴 완성 명령을 그대로 보여준다.
그 줄을 그대로 복사해 실행하면 되고, 자동화는 오류 출력을 읽어 재시도할 수 있다.

## 업무 첨부

`--json` 출력 스키마는 [post.md](references/post.md) 를 읽는다.

| 의도 | 커맨드 |
| --- | --- |
| 첨부 목록 | `dooray post file list <project> <number>` |
| 첨부 다운로드 | `dooray post file download <project> <number> <file-id>` |
| 첨부 일괄 다운로드 | `dooray post file download-all <project> <number>` — 첨부 목록과 본문에 삽입된 파일을 함께 받는다. 본문 쪽을 빼려면 `--no-inline` |
| 첨부 업로드 | `dooray post file upload <project> <number> <file-path>` |
| 첨부 삭제 | `dooray post file delete <project> <number> <file-id>` — 확인 있음, `-y`/`--yes`로 생략 |
| 댓글 첨부 목록 | `dooray post comment file list <project> <number> <comment-id>` |
| 댓글 첨부 업로드 | `dooray post comment file upload <project> <number> <comment-id> <path>` — 댓글 본문이 `text/html` 이면 파일을 올리기 전에 종료 코드 3 으로 멈춘다 |
| 댓글 첨부 다운로드 | `dooray post comment file download <project> <number> <comment-id> <file-id>` — 저장 경로는 `--out <path>` 다. 다른 download 명령의 `-o, --output <dir>` 와 옵션 이름이 다르다 |
| 댓글 첨부 삭제 | `dooray post comment file delete <project> <number> <comment-id> <file-id>` — 확인 있음, `-y`/`--yes`로 생략. 본문에서 그 파일의 참조를 찾지 못하면 본문도 파일도 건드리지 않고 종료 코드 3 으로 멈춘다 |

- 댓글 파일 업로드는 이미지 확장자면 이미지 마크다운을, 그 외에는 일반 링크를 만든다.
- `comment file list`의 `출처`는 다음과 같다.
  - `attachment` (`첨부`): 웹 UI 첨부
  - `body-link` (`본문 링크`): CLI 업로드 링크
  - `both` (`둘 다`): 양쪽에 있는 파일
- `--json` 항목은 `{ id, name, size, mimeType, source }` 형식이다.
  `source`는 위 값 중 하나다.
- 메타데이터를 채우지 못하면 `name`, `size`, `mimeType`은 `null`이다.

## 위키

| 의도 | 커맨드 |
| --- | --- |
| 위키 목록 | `dooray wiki list` — `ID`, `Name`, `Project`, `Type` 네 열을 낸다. 이름은 `--search` 로 찾는다 |
| 이름으로 위키 찾기 | `dooray wiki list --search <keyword>` — 이름 부분 일치, 대소문자 무시, 전체 목록에서 찾는다 |
| 페이지 목록 | `dooray wiki pages <project>` |
| 페이지 트리 | `dooray wiki tree <project>` (`--depth N` 으로 상한, `--json` 은 flat) |
| 페이지 상세 | `dooray wiki page get --id <page-id>` — project 없이 조회된다. `<project> <page-id>` 와 `--url` 도 받는다 |
| 페이지 ID 로 바로 조회 | `wiki page edit`, `wiki page file`, `wiki page comment`, `wiki page delete` 도 `--id` 만으로 동작한다 |
| 페이지 생성 | `dooray wiki page create <project> --title "..." [--parent <page-id>] [--body "..."]` — `--parent` 를 생략하면 위키 home 아래에 만든다 |
| 페이지 제목 수정 | `dooray wiki page edit <project> <page-id> --title "..."` — `--id <page-id>` 와 `--url` 도 받는다 |
| 페이지 본문 수정 | `dooray wiki page edit <project> <page-id> --body "..."` 또는 `--body-file ./new.md` — `--id <page-id>` 와 `--url` 도 받는다. 본문 형식이 기존과 다르면 `--mime-type` 을 함께 준다 |
| 페이지 본문 일부만 수정 | `dooray wiki page replace --id <page-id> --old "..." --new "..."` — 긴 본문에서 몇 군데만 고칠 때 `edit` 대신 쓴다. 규칙은 [wiki.md](references/wiki.md) |
| 페이지 에디터로 수정 | `dooray wiki page edit <project> <page-id>` — 플래그가 없으면 `$EDITOR` 가 열린다 |
| 페이지 이동 | `dooray wiki page move <project> <page-id> --parent <parent-page-id>` — `--parent` 는 필수다. 하위 페이지는 기본으로 함께 이동하고, `--no-children` 으로 페이지 하나만 옮긴다. `--to-wiki <project-or-wiki-id>` 로 다른 위키로 옮기며, `--first` 와 `--before <page-id>` 로 형제 사이 정렬을 바꾼다 |
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
| 메일 상세 | `dooray mail get <uid\|url\|mail-id>` — `mail list` 의 UID, 메일 웹 주소, 그 주소의 19자리 id 를 모두 받는다 |
| 메일 발송 | `dooray mail send --to "..." --subject "..." --body "..."` — 숨은참조는 `--bcc`, HTML 본문은 `--html` |
| 메일 답장 | `dooray mail reply <uid\|url\|mail-id> --body "..."` — HTML 본문은 `--html` |
| 저장된 인증정보 제거 | `dooray mail logout` (비대화형 환경은 `--yes`) |

답장하거나 메일 웹 주소로 원본을 고를 때는 [mail.md](references/mail.md) 를 먼저 읽는다.

## 메신저

| 의도 | 커맨드 |
| --- | --- |
| 1:1 다이렉트 메시지 | `dooray messenger send --to "<id\|email>" --body "..."` — `--to` 는 ID 나 이메일만 받고 이름은 지원하지 않는다 |
| 대화방 메시지 | `dooray messenger channel-send --channel "<channelId\|이름>" --body "..."` — 이름으로는 자신이 속한 방만 찾는다 |
| 대화방 스레드 열기 | `dooray messenger thread-send --channel "<channelId\|이름>" --body "..."` — `--thread-body` 나 `--thread-body-file` 로 첫 메시지를 함께 보내고, `--log <log-id>` 로 이미 올라간 메시지에 연다 |
| 대화방 목록 | `dooray messenger channels [--type direct\|private\|me\|bot] [--search <이름>] [--since <날짜>] [--all]` — 수정 시각(updatedAt) 최신순, 보관·숨긴·시스템 방은 `--all` 로 포함. `logs`·`channel-send` 에 넘길 channelId 를 여기서 찾는다 |
| 대화방 메시지 읽기 | `dooray messenger logs "<channelId\|이름>" [-n\|--count <개수>]` — 최근 N건(기본 20, 최대 1000). 표는 오래된 것이 위, 최신이 아래 |

대화방을 찾거나 `logs` 로 메시지를 읽거나 진행 상황을 스레드에 보고할 때는 [messenger.md](references/messenger.md) 를 먼저 읽는다.

## 캘린더

| 의도 | 커맨드 |
| --- | --- |
| 캘린더 목록 | `dooray calendar list` — `--quiet` 은 캘린더 id |
| 오늘 일정 | `dooray calendar event list` |
| 기간 일정 | `dooray calendar event list --from <일시> --to <일시>` — `YYYY-MM-DD` 또는 `2026-09-20T09:00:00+09:00` |
| 일정 상세 | `dooray calendar event get <calendar-id> <event-id>` — 두 id 가 모두 필요하다 |

일정을 조회하기 전에 [calendar.md](references/calendar.md) 를 읽는다. 기간 해석과 조회 상한, 참석자를 확인하는 방법이 거기 있다.

## 옵션 이름

`post` 와 `wiki page` 모두 제목은 `--title` 이다.
`post create` 와 `post edit` 는 `--subject` 를 받지 않는다. 제목은 `--title` 로 준다.
`post list` 의 `--subject` 는 제목 키워드 필터다.

`--from`·`--to` 는 명령마다 뜻이 다르다.
`post list` 에서는 등록자·담당자 **멤버** 필터이고, `calendar event list` 에서는 조회 기간의 시작·끝 **날짜**다.
업무를 기간으로 거르려면 `post list` 의 `--created`(등록)·`--updated`(수정)를 쓴다.
