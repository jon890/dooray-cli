# 업무와 위키

업무와 위키 페이지를 조회하고 고치는 명령의 세부 동작을 다룬다.

## 기본 명령

```bash
dooray project list                          # 내 프로젝트
dooray post list <project>                   # 업무 목록
dooray post list <project> --tag "<태그 이름>"  # 태그로 거르기
dooray post list <project> --from me --created 2026-09-01~  # 내가 9월 이후 등록한 업무
dooray post get <project> 42                 # 업무 상세
dooray post create <project> --title "제목"  # 업무 생성
dooray post comment add <project> 42 --body "댓글"
dooray wiki pages <project>                  # 위키 페이지 목록
dooray wiki page get --id <page-id>          # 페이지 ID 하나로 조회 (project 불필요)
dooray wiki list --search 설계               # 위키 이름으로 찾기 (대소문자 무시)
dooray wiki page get --url "https://<tenant>.dooray.com/wiki/<wikiId>/<pageId>"
dooray wiki page edit --id <page-id> --body-file notes.md   # 페이지 ID 하나로 본문 수정
dooray post replace <project> 42 --old "초안" --new "확정"   # 본문 일부만 치환
dooray wiki page move --id <page-id> --parent <parent-page-id>
dooray wiki page move --id <page-id> --parent <parent-page-id> --no-children
dooray mail list --unread                    # 안 읽은 메일
```

```bash
dooray post edit <project> 42 --cc-group <group-code>  # 제목·본문 없이 참조자 그룹 추가
```

참조자·담당자 옵션만 지정하면 `$EDITOR`를 열지 않고 기존 제목·본문·태그를 보존한 채 참여자만 바꾼다.

## 태그 확인과 태그로 찾기

업무 상세를 그냥 조회하면 붙어 있는 태그가 이름으로 함께 나온다.

`--json` 은 서버 응답을 그대로 내므로 태그에 `id` 만 들어 있다.
이름이 필요하면 `--with-tag-names` 를 함께 준다.

```bash
dooray post get <project> 42 --json --with-tag-names
dooray post list <project> --tag "<태그 이름>"
dooray post list <project> --tag "<이름 A>" --tag "<이름 B>"
```

`--with-tag-names` 는 이름을 채우지 못한 태그가 하나라도 있으면 멈춘다.
옵션을 주지 않으면 출력이 서버 응답 그대로다.

`--tag` 를 여러 번 주면 그 태그를 모두 가진 업무만 온다.

## 사람·상위 업무·기간으로 거르기

```bash
dooray post list <project> --to me --parent 42               # 42번의 하위 업무 중 내 담당
dooray post list <project> --from "김철수"
dooray post list <project> --cc me --updated prev-7d --order -postUpdatedAt
dooray post list <project> --created 2026-09-01~2026-09-30
```

`--from`·`--to`·`--cc` 는 등록자·담당자·참조자다. 옵션마다 한 명을 받고 `me`, 멤버 id, 이메일, 프로젝트 멤버 이름으로 준다.
같은 옵션을 두 번 주면 조회하기 전에 오류로 끝난다. 여러 사람을 보려면 한 사람씩 따로 조회해 합친다.
값의 앞뒤 공백은 지우고 해석한다. 빈 값이나 공백만 있는 값은 조회하기 전에 오류로 끝난다.

`--parent` 는 이 프로젝트의 업무 번호(`42`), 다른 프로젝트의 `<project>/<number>`, postId 를 받는다.

`--created`·`--updated` 는 `A~B`, `A~`(그 뒤로), `~B`(그 앞으로), `prev-<N>d`(최근 N일, N 은 1 이상)를 받는다.
A·B 는 `2026-09-01` 같은 날짜나 `2026-09-01T09:00:00+09:00` 같은 일시다.
날짜만 주면 A 는 그 날 0시, B 는 그 날 23시 59분 59초로 본다.
없는 날짜나 끝이 시작보다 앞선 범위는 조회하기 전에 오류로 끝난다.
`~` 로 시작하는 값은 셸이 홈 디렉터리로 바꾸려 하므로 `--created "~2026-09-30"` 처럼 따옴표로 감싼다.

`--order` 는 `createdAt`·`postUpdatedAt`·`postDueAt` 중 하나이고 앞에 `-` 를 붙이면 내림차순이다. 기본은 `-createdAt` 이다.

## 본문 일부만 고치기

`post edit --body` 와 `wiki page edit --body` 는 본문 전체를 바꾼다.
긴 본문에서 한두 군데만 고칠 때는 `replace` 로 바꿀 구간만 준다.

```bash
dooray post replace <project> 42 --old "2. 배포" --new "2. 카나리 배포"
dooray wiki page replace --id <page-id> --old-file old.md --new-file new.md
dooray post replace <project> 42 --old "v1.2" --new "v1.3" --all --dry-run
```

- `--old` 는 공백과 줄바꿈까지 정확히 일치해야 한다. 여러 줄이거나 따옴표가 섞이면 `--old-file`/`--new-file` 로 준다. `-` 는 stdin 이며, old 와 new 가 함께 stdin 을 쓸 수는 없다
- 파일과 stdin 으로 준 값은 UTF-8 BOM 과 끝 줄바꿈 하나를 떼고 쓴다. 에디터나 `echo` 가 붙인 줄바꿈 때문에 어긋나지 않게 하려는 것이다. 끝 줄바꿈까지 일치시켜야 하면 인자로 준다 (`--old $'마지막 줄\n'`)
- 구간을 지우려면 인자로 `--new ""` 를 준다. 파일이나 stdin 으로 읽은 new 가 비어 있으면 앞 명령이 실패한 것과 구분할 수 없어 종료 코드 3 으로 멈춘다
- 일치하는 곳이 없으면 종료 코드 3 으로 멈춘다. 두 군데 이상이면 몇 군데인지 알리고 멈추므로, 앞뒤 문맥을 더 넣어 한 군데만 일치하게 하거나 `--all` 로 모두 바꾼다
- `--dry-run` 은 수정하지 않고 바뀌는 줄만 diff 형식으로 보여준다. 탭은 그대로, CR 은 `<CR>` 로 보인다. 긴 줄은 바뀐 곳 앞뒤 80자만 남기고 `...` 로 줄이므로, 잘린 줄은 그대로 복사해 `--old` 로 쓸 수 없다
- 제목·담당자·태그·본문 형식은 그대로 둔다. 치환으로 첨부나 인라인 이미지 참조가 사라지면 확인을 받고, 자동화에서는 `--no-confirm` 으로 넘긴다
- 내부적으로는 현재 본문을 읽어 바꾼 뒤 전체를 다시 보낸다. 그 사이에 다른 사람이 같은 본문을 고치면 그 수정을 덮어쓴다

## 본문 형식

업무와 댓글과 위키 페이지의 본문은 마크다운이거나 HTML 이다.
`post edit`, `post comment edit`, `wiki page edit` 는 수정할 때 기존 형식을 그대로 유지한다.

주는 본문의 형식이 기존과 다르면 `--mime-type` 으로 명시한다.
빠뜨리면 마크다운 본문이 HTML 로 저장되어 웹에서 원문이 그대로 보인다.

```bash
dooray post get <project> 42 --json | jq .body.mimeType    # "text/html"
dooray post edit <project> 42 --body-file notes.md --mime-type text/x-markdown
dooray post edit <project> 42 --mime-type text/html        # 본문은 그대로, 형식만 되돌리기
```

값은 `text/x-markdown` 과 `text/html` 둘뿐이다.
본문을 바꾸지 않고 형식만 바꾸면 CLI 가 본문을 변환하지 않는다는 경고가 나온다.

## 멘션과 업무 링크

`post edit` 과 `post comment edit` 은 본문에 멘션과 다른 업무 링크를 붙인다.

```bash
dooray post edit <project> 42 --title "배포 준비" --mention 홍길동
dooray post comment edit <project> 42 --comment-id <comment-id> --body "확인 부탁" --link-task <project>/7
```

| 옵션 | 동작 |
| --- | --- |
| `--mention <name>` | 이름으로 멤버를 찾아 본문 앞에 멘션을 붙인다 (반복 가능) |
| `--mention-group <code>` | 그룹 코드로 찾아 멘션을 붙인다 (반복 가능) |
| `--link-task <ref>` | 다른 업무 링크를 본문 끝에 붙인다. `<project>/<number>` 또는 postId (반복 가능) |
| `--dry-run` | API 를 호출하지 않고 합성된 본문만 stdout 에 출력한다 |

**본문 형식이 `text/html` 이면 이 세 옵션을 쓸 수 없다.**
그 형식의 멘션과 링크 표기가 확인되지 않아, 종료 코드 3 으로 멈추고
`--mime-type text/x-markdown` 으로 형식을 바꾸는 방법을 안내한다.
추측한 표기를 넣으면 링크로 렌더링되지 않는 문자열이 본문에 남는다.

`post edit` 에서 `--mention` 이나 `--link-task` 만 주면 편집기를 열지 않고 기존 본문에 붙여 수정한다.
`--dry-run` 을 붙이면 수정하지 않고 합성한 본문만 출력한다.

## 댓글에 파일 첨부

```bash
dooray post comment file upload <project> <number> <comment-id> <path>
```

이미지 확장자는 이미지 마크다운으로, 그 외 파일은 일반 링크로 댓글 본문에 추가한다.
`comment file list`는 웹 UI 첨부와 CLI 업로드 파일을 함께 보여주며 `출처` 열로 구분한다.
CLI로 올린 파일은 댓글의 첨부 카드가 아니라 본문 링크로 표시된다.

본문 형식에 따라 두 명령이 멈추는 조건이 있다.

- `comment file upload` 는 댓글 본문이 `text/html` 이면 파일을 올리기 전에 종료 코드 3 으로 멈춘다.
  그 형식의 첨부 표기가 확인되지 않아, 올려도 본문에서 그 파일에 닿을 수 없다
- `comment file delete` 는 댓글 본문에서 그 파일의 참조를 찾지 못하면
  본문도 파일도 건드리지 않고 종료 코드 3 으로 멈춘다.
  종전에는 참조를 찾지 못해도 파일을 지워 본문에 대상이 사라진 링크가 남았다.
  파일만 지우려면 `dooray post file delete` 를 쓴다

## 첨부 파일 내려받기

```bash
dooray post file download-all <project> 42 -o ./files
dooray post file download-all <project> 42 -o ./files --no-inline
```

첨부 목록에 있는 파일과 본문에 삽입된 파일을 함께 받는다.
본문에 이미지를 붙여 넣기만 한 업무는 첨부 목록이 비어 있어도 그 이미지를 받는다.
본문 쪽을 제외하려면 `--no-inline` 을 준다.

## 삭제 명령의 확인

| 영역 | 삭제 명령 |
| --- | --- |
| 업무 | `dooray post comment delete`<br>`dooray post file delete`<br>`dooray post comment file delete` |
| 위키 | `dooray wiki page delete`<br>`dooray wiki page file delete`<br>`dooray wiki page comment delete` |

여섯 명령은 TTY에서 기본값이 아니오인 `y/N` 확인을 요청한다.
자동화·파이프 등 non-TTY 실행에서는 `-y` 또는 `--yes`로 확인을 생략해야 한다.
플래그가 없으면 삭제 API를 호출하기 전에 종료 코드 3으로 끝난다.
기존 삭제 자동화에는 명시적인 yes 플래그를 추가해야 한다.

`post comment delete` 와 `post file delete` 는 `--json` 과 `--quiet` 을 함께 받는다.
`--json` 은 삭제한 식별자와 `status` 를 내고, `--quiet` 은 식별자 한 줄만 낸다.
식별자의 키 이름은 명령마다 다르다. 댓글 삭제는 `commentId`, 파일 삭제는 `fileId` 다.

## 프로젝트 태그 만들기

업무에 붙일 태그를 CLI 에서 만든다.

```bash
dooray project tags <project>                                    # 태그 목록
dooray project tags list <project>                               # 같은 동작
dooray project tags create <project> --name "배포환경:staging"    # 그룹에 속한 태그
dooray project tags create <project> --name "긴급" --color c6eab3  # 그룹 없는 태그
dooray project tags group <project> "배포환경" --select-one        # 그룹에서 하나만 고르게
```

`--name` 은 `"그룹명:태그명"` 형식이고 그룹명은 생략할 수 있다.
같은 그룹명으로 여러 번 만들면 그 그룹에 태그가 쌓인다.
`--color` 를 생략하면 회색이 붙는다.

`group` 은 그룹의 필수 여부(`--mandatory`)와 단일 선택 여부(`--select-one`)를 바꾼다.
해제는 `--no-mandatory` 와 `--no-select-one` 이고, 지정하지 않은 쪽은 그대로 둔다.
태그가 하나도 없는 그룹은 대상이 되지 않는다.

프로젝트 코드가 `list`, `create`, `group` 중 하나와 같으면 그 인자가 하위 명령으로 먼저 읽힌다.
그때는 `dooray project tags list <project>` 로 목록을 조회한다.

태그 이름·색상 수정과 태그 삭제는 Dooray API 에 경로가 없어 웹 설정 화면에서 한다.
