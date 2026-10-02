# post

대상 지정 방법(`--id` / `--url` / positional URL)은 [SKILL.md](../SKILL.md) 에 있다. 여기에는 post 고유 동작만 둔다.

## postId 를 업무 번호 자리에 넣지 않는다

`post create --json` 의 `.id` 는 19자리 internal postId 다. 업무 번호(`#42`)가 아니다.
번호 자리에 넣으면 안내 에러가 난다. 후속 명령에는 `--id` 를 쓴다.

```bash
POST_ID=$(dooray post create <project> --title "..." --json | jq -r '.id')
dooray post get --id "$POST_ID"                        # 올바름
dooray post comment add --id "$POST_ID" --body "댓글"   # 올바름
dooray post get <project> "$POST_ID"                   # 에러
```

`--id` 와 `--url` 을 함께 주면 에러다. positional 인자와 `--id`/`--url` 을 섞어도 에러다.

## URL 이나 `--id` 모드에서는 sub-id 를 옵션으로 준다

positional 모드에서 세 번째 인자였던 값이 옵션으로 바뀐다.

```bash
dooray post comment edit  --url <url> --comment-id <commentId> --body "..."
dooray post comment delete --url <url> --comment-id <commentId>
dooray post file download --url <url> --file-id <fileId> -o ./downloads
dooray post file delete   --url <url> --file-id <fileId>
dooray post file upload   --url <url> --file ./report.pdf
```

기존 positional 형태(`comment edit <project> <number> <comment-id>`)는 그대로 쓸 수 있다.

## 삭제 안전 확인

다음 업무 삭제 명령은 같은 안전 확인 정책을 따른다.

- `dooray post comment delete`
- `dooray post file delete`
- `dooray post comment file delete`

TTY 확인, non-TTY 실행, `-y`와 `--yes` 사용법은 [SKILL.md](../SKILL.md#삭제-명령의-확인-동작)를 따른다.

## 업무 목록 거르기

`post list` 의 필터는 함께 줄 수 있고 `--all` 이면 모든 페이지에 같은 조건이 걸린다.

```bash
dooray post list <project> --from me --created 2026-09-01~           # 9월 이후 내가 등록한 업무
dooray post list <project> --to me --parent 42                       # 42번의 하위 업무 중 내 담당
dooray post list <project> --cc me --updated prev-7d --order -postUpdatedAt
dooray post list <project> --to user@example.com --all
```

| 옵션 | 동작 |
| --- | --- |
| `--from` / `--to` / `--cc` | 등록자·담당자·참조자. `me`, 멤버 id(15자리 이상), 이메일, 프로젝트 멤버 이름을 받는다. 옵션마다 한 명 |
| `--parent` | 그 업무의 하위 업무만. 이 프로젝트의 업무 번호(`42`), `<project>/<number>`, postId(15자리 이상 숫자) |
| `--created` / `--updated` | 등록·수정 기간. 형식은 아래 |
| `--order` | `createdAt`·`postUpdatedAt`·`postDueAt` 중 하나. 앞에 `-` 를 붙이면 내림차순. 기본 `-createdAt` |

같은 멤버 옵션을 두 번 주면 조회 전에 종료 코드 3 으로 끝난다. 여러 사람의 결합 규칙이 공식 문서에 없어 받지 않는다.
"A 나 B 가 담당인 업무" 가 필요하면 `--to` 를 한 사람씩 따로 조회해 합친다.
멤버 값의 앞뒤 공백은 지우고 해석한다. 빈 값이나 공백만 있는 값(`--from "$WHO"` 에서 변수가 빈 경우 등)은 조회 전에 종료 코드 3 으로 끝난다.

`--parent` 의 짧은 숫자는 이 프로젝트의 업무 번호로 본다. `post create --parent` 와 달리 postId 를 쓰려면 15자리 이상 숫자여야 한다.
숫자도 `<project>/<number>` 도 아닌 값은 조회 전에 종료 코드 3 으로 끝난다.

기간은 네 가지 형태다.

| 형태 | 뜻 |
| --- | --- |
| `A~B` | A 부터 B 까지 |
| `A~` | A 이후 |
| `~B` | B 이전 |
| `prev-<N>d` | 최근 N일. N 은 1 이상 |

`~B` 는 따옴표로 감싸 `--created "~2026-09-30"` 처럼 준다. 감싸지 않으면 zsh 는 `~` 를 홈 디렉터리로 해석하다 실패한다.

A·B 는 `2026-09-01` 같은 날짜나 `2026-09-01T09:00:00+09:00` 같은 offset 이 붙은 일시다.
날짜만 주면 A 는 그 날 `00:00:00`, B 는 그 날 `23:59:59` 로 본다. `2026-09-01~2026-09-01` 은 그 날 하루다.
날짜 하나만 준 값(`--created 2026-09-01`), offset 없는 일시, 없는 날짜, 끝이 시작보다 앞서거나 같은 범위는
조회 전에 종료 코드 3 으로 끝난다. `--order` 에 목록 밖의 값을 주어도 조회 전에 끝난다.

## 업무 생성

```bash
dooray post create <project> \
  --title "제목" \
  --body "본문 마크다운" \
  --to "김철수" --to "이영희" \
  --cc "참조자" \
  --cc-group dev-team \
  --priority normal \
  --due-date "2026-04-30T18:00:00+09:00" \
  --tag "버그" --tag "긴급" \
  --parent "<project>/337" \
  --workflow "진행 중" \
  --milestone "Sprint 12"
```

| 옵션 | 받는 값 |
| --- | --- |
| `--priority` | `highest` / `high` / `normal` / `low` / `lowest` |
| `--due-date` | ISO 8601 |
| `--parent` | `<project>/<number>` 또는 raw postId |
| `--workflow` | 이름 또는 class (`registered` / `working` / `closed`). 부분일치가 모호하면 후보와 함께 에러 |
| `--tag` | 반복 지정. mandatory 태그 그룹은 클라이언트가 미리 검증한다 |

`--body` 와 `--body-file` 은 함께 쓸 수 없다.

**`--workflow` 는 생성 후 별도 호출이다.** 설정에 실패해도 업무는 이미 만들어졌으므로
stderr 에 경고만 나가고 **종료 코드는 0** 이다. 워크플로우 적용을 보장해야 하면 stderr 를 따로 확인한다.

## 참조자와 담당자 변경

```bash
dooray post edit <project> <number> --cc-group dev-team        # 기존 유지 + 추가 (중복 제거)
dooray post edit <project> <number> --cc-clear --cc 홍길동      # 기존 비우고 신규만
dooray post edit <project> <number> --to 김철수 --to-group qa-team
dooray post edit <project> <number> --to-clear --to 김철수          # 담당자를 비우고 신규만
```

`--dry-run --json` 으로 API 호출 없이 결과를 먼저 볼 수 있다.
미리보기에는 요청에 실릴 `mimeType` 도 들어 있다.

```bash
dooray post edit --id "$POST_ID" --cc-group qa-team --dry-run --json | jq '.users.cc'
```

참조자·담당자 옵션만 지정하면 `$EDITOR`를 열지 않고 기존 제목·본문·태그를 보존한 채 참여자만 바꾼다.

## 본문 일부만 치환

긴 본문에서 몇 군데만 고칠 때는 `post edit --body` 대신 `post replace` 를 쓴다.
`edit` 는 본문 전체를 받아 통째로 바꾸므로 전문을 읽고 고쳐 다시 보내야 한다. `replace` 는 바꿀 구간만 보낸다.

| 상황 | 명령 |
| --- | --- |
| 본문을 새로 쓰거나 대부분 바꿈 | `post edit --body-file` |
| 긴 본문의 한두 군데 수정 | `post replace --old ... --new ...` |
| 같은 문자열을 전부 수정 | `post replace --old ... --new ... --all` |

```bash
# 한 줄
dooray post replace <project> <number> --old "2. 배포" --new "2. 카나리 배포"

# 여러 줄이나 따옴표·백틱이 섞인 구간은 파일로 (셸 이스케이프를 피한다)
dooray post replace --id "$POST_ID" --old-file old.md --new-file new.md --dry-run
dooray post replace --id "$POST_ID" --old-file old.md --new-file new.md

# new 를 stdin 으로
printf '바뀐 문단\n' | dooray post replace --id "$POST_ID" --old-file old.md --new -
```

- **old 는 공백·줄바꿈·들여쓰기까지 정확히 같아야 한다.** `post get --json` 의 `body.content` 에서 그대로 잘라 쓴다. 화면 출력에서 옮기면 공백이 달라질 수 있다
- 파일과 stdin 으로 준 old·new 는 UTF-8 BOM 과 **끝 줄바꿈 하나를 떼고** 쓴다. 에디터와 `echo` 가 붙이는 줄바꿈 때문이다. 끝 줄바꿈까지 일치시켜야 하면 인자로 준다(`--old $'마지막 줄\n'`). 인자로 준 값은 그대로 쓴다
- 일치가 없으면 종료 코드 3 이다. 다시 조회해 old 를 고친다. 본문 줄바꿈이 CRLF 인데 old 에 CR 이 없거나, 유니코드 정규화 형식(NFC/NFD)만 달라 일치하지 않으면 그 사실을 함께 알려준다
- 두 군데 이상 일치하면 몇 군데인지 알리고 종료 코드 3 으로 멈춘다. 한 군데만 바꾸려면 앞뒤 문맥을 더 넣어 old 를 유일하게 만들고, 전부 바꾸려면 `--all` 을 붙인다
- old 와 new 가 같으면 거부된다. old 구간을 지우려면 인자로 `--new ""` 를 준다. 삭제는 이 방법으로만 한다. `--new-file`·`--new -` 로 읽은 내용이 비어 있으면(빈 파일, 줄바꿈만 든 파일, 빈 stdin) 앞 명령의 실패와 구분할 수 없어 종료 코드 3 으로 거부된다. `--old-file ""`/`--new-file ""` 처럼 파일 경로가 비어도 거부된다
- `--old`/`--old-file` 중 하나, `--new`/`--new-file` 중 하나를 준다. `-` 는 stdin 이고 old 와 new 가 함께 stdin 을 쓸 수는 없다
- `--dry-run` 은 수정하지 않고 바뀌는 줄만 `-`/`+` 로 보여준다. 본문 전체는 내지 않는다. 탭은 그대로, CR 은 `<CR>` 로 보인다. 긴 줄은 바뀐 곳 앞뒤 80자만 남기고 `...` 로 줄인다. 잘린 줄은 old 로 그대로 쓸 수 없으니 old 는 `post get --json` 에서 잘라 온다. `--json` 의 `hunks` 는 줄이지 않는다. `--json` 과 함께 주면 `{ dryRun, postId, replaced, mimeType, hunks: [{ line, before, after }] }`, `--quiet` 이면 바뀔 군데 수 한 줄이다
- 성공하면 `--json` 은 `{ postId, number, replaced }`, `--quiet` 은 postId 다
- 제목·우선순위·마감·담당자·참조자·태그·본문 형식은 그대로 둔다. `--mime-type` 은 없다
- 치환으로 첨부 참조(`/files/<id>`)가 사라지면 `post edit` 과 같이 확인을 받는다. 의도한 것이면 `--no-confirm`
- 내부적으로는 현재 본문을 읽어 바꾼 뒤 전체를 다시 보낸다. 그 사이에 다른 사람이 본문을 고치면 그 수정을 덮어쓴다. 여럿이 동시에 편집 중인 업무는 웹에서 고친다

## 본문 전체 교체와 첨부 손실 주의

`post edit` 와 `post comment edit` 는 본문을 통째로 바꾼다.
새 본문에 기존 첨부의 이미지 마크다운(`![](/files/<id>)`)이나 일반 링크(`[](/files/<id>)`)가 없으면 확인을 요청하고,
TTY 가 아니면 중단된다.

첨부를 지키려면 기존 본문에서 reference 를 먼저 뽑아 새 본문에 포함한다.

```bash
# post edit 전
dooray post get <project> <number> --json | jq -r '.body.content' | grep -oE '!?\[[^]]*\]\(/files/[^)]+\)'

# post comment edit 전
dooray post comment get <project> <number> <comment-id> --json | jq -r '.body.content'
```

첨부를 정말 떼려는 것이면 `--no-confirm` 으로 진행한다.

본문 형식은 기존 값을 그대로 유지한다.
`text/html` 업무에 마크다운을 주면 마크다운 원문이 그대로 저장되므로,
주는 본문의 형식이 기존과 다르면 `--mime-type text/x-markdown` 처럼 함께 준다.
`--mime-type` 만 단독으로 주면 본문은 그대로 두고 형식만 바꾼다.

`comment file list`는 웹 UI 첨부와 CLI 업로드 링크를 함께 보여주고 `출처` 열로 구분한다.

- `attachment`: 웹 UI 첨부
- `body-link`: CLI 업로드 링크
- `both`: 양쪽에 있는 파일

`--json` 항목은 `{ id, name, size, mimeType, source }` 형식이다.
메타데이터를 채우지 못하면 `name`, `size`, `mimeType`은 `null`이다.

## 이름이 겹칠 때

`--cc 홍길동` 이 모호하다는 에러가 나면 이메일이나 memberId 로 지정한다.

```bash
dooray post edit --id "$POST_ID" --cc user.specific@example.com

MEMBER_ID=$(dooray member search 홍길동 --json | jq -r '.[] | select(.externalEmailAddress=="user.specific@example.com") | .id')
dooray post edit --id "$POST_ID" --cc "$MEMBER_ID"
```

`--cc`, `--to`, `--mention` 이 같은 규칙으로 값을 해석한다.

- 15자리 이상 숫자 → memberId 로 그대로 사용
- 이메일 형태 → exact 매칭
- 그 외 → 이름 부분일치

**이름은 그 프로젝트의 멤버만 찾는다.** 이메일과 memberId 는 조직 전체에서 찾는다.

그래서 프로젝트 멤버가 아닌 사람을 이름으로 지정하면 실패한다.

```bash
dooray post create <project> --to 홍길동                  # 프로젝트 멤버가 아니면 실패
dooray post create <project> --to user@example.com        # 통과
```

에러에 붙는 "사용 가능한 멤버 (N/M)" 은 CLI 의 조회 한계가 아니라 **그 프로젝트의 멤버 목록**이다.
일부만 가져온 것으로 오해하기 쉬운 표기다.

대상이 그 프로젝트 멤버인지 확실하지 않으면 처음부터 이메일을 쓴다. 이메일은 `dooray member search <이름>` 으로 찾는다.

## 부모 업무 지정

```bash
CHILD_ID=$(dooray post create <project> --title "subtask A" --json | jq -r '.id')
dooray post edit --id "$CHILD_ID" --parent <project>/<parent-number>
```

`--parent` 는 단독으로 동작하지 않는다. `--title`, `--body`, `--body-file`, `--tag` 계열,
참조자와 담당자 변경 옵션, `--mime-type` 중 하나를 함께 줘야 비대화형 수정으로 들어간다.
아무것도 바꾸지 않으려면 원래 제목을 `--title` 에 그대로 넣는다.
parent 해제는 API 가 지원하지 않아 CLI 로 할 수 없다. 웹 UI 에서 처리한다.
계층 구조는 두 단계를 넘지 못한다. 상위업무를 가진 하위업무를 상위 업무로 설정할 수 없고,
그 조건에서 `--parent` 를 쓰면 실패한다.

## 태그만 바꾸기

`--title` 이나 `--body` 없이 태그 옵션만으로 호출할 수 있다. 기존 본문은 자동으로 다시 전송된다.

```bash
dooray post edit --id "$POST_ID" --tag "분류: 성능"
dooray post edit --id "$POST_ID" --tag-clear --tag "재분류"
dooray post edit --id "$POST_ID" --tag-remove "긴급"
```
