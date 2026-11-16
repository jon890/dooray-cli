# 업무와 위키

업무와 위키 페이지를 조회하고 고치는 방법을 안내해요.
아직 연결하지 않았다면 [설치와 설정](setup.md)을 먼저 따라 해요.

1. [자주 쓰는 명령](#자주-쓰는-명령)
2. [업무 찾기](#업무-찾기)
3. [업무와 위키 고치기](#업무와-위키-고치기)
4. [파일 다루기](#파일-다루기)
5. [지우기](#지우기)
6. [프로젝트 태그 만들기](#프로젝트-태그-만들기)
7. [자세히](#자세히)

## 자주 쓰는 명령

`<project>` 자리에는 `dooray project list` 에 나온 프로젝트 코드를 넣어요.

```bash
dooray project list                          # 내 프로젝트
dooray post list <project>                   # 업무 목록
dooray post get <project> 42                 # 업무 상세
dooray post create <project> --title "제목"  # 업무 생성
dooray post comment add <project> 42 --body "댓글"
dooray wiki pages <project>                  # 위키 페이지 목록
dooray wiki list --search 설계               # 위키 이름으로 찾기 (대소문자 무시)
dooray wiki page get --id <page-id>          # 페이지 ID 하나로 조회 (project 불필요)
dooray wiki page get --url "https://<tenant>.dooray.com/wiki/<wikiId>/<pageId>"
dooray mail list --unread                    # 안 읽은 메일
```

업무와 위키 페이지는 `<project> <번호>` 대신 `--id` 나 `--url` 로도 가리킬 수 있어요.
Dooray 주소를 첫 인자에 그대로 붙여 넣어도 돼요.

## 업무 찾기

`post list` 에 조건을 붙여서 원하는 업무만 골라요.

```bash
dooray post list <project> --tag "<태그 이름>"                    # 태그로
dooray post list <project> --to me --parent 42                    # 42번의 하위 업무 중 내 담당
dooray post list <project> --from "김철수"                        # 김철수가 등록한 업무
dooray post list <project> --from me --created 2026-09-01~        # 내가 9월 이후 등록한 업무
dooray post list <project> --cc me --updated prev-7d --order -postUpdatedAt
```

### 태그로 찾기

`--tag` 를 여러 번 주면 그 태그를 모두 가진 업무만 나와요.

```bash
dooray post list <project> --tag "<이름 A>" --tag "<이름 B>"
```

업무 상세(`post get`)를 그냥 조회하면 붙어 있는 태그가 이름으로 함께 나와요.
`--json` 은 서버 응답을 그대로 내서 태그에 `id` 만 들어 있어요.
이름이 필요하면 `--with-tag-names` 를 함께 줘요.

```bash
dooray post get <project> 42 --json --with-tag-names
```

`--with-tag-names` 는 이름을 채우지 못한 태그가 하나라도 있으면 멈춰요.
이 옵션을 주지 않으면 출력은 서버 응답 그대로예요.

### 사람으로 찾기

| 옵션 | 뜻 |
| --- | --- |
| `--from` | 등록자 |
| `--to` | 담당자 |
| `--cc` | 참조자 |

- 옵션마다 한 명만 받아요. `me`, 멤버 id, 이메일, 프로젝트 멤버 이름 중 하나로 줘요.
- 같은 옵션을 두 번 주면 조회하기 전에 오류로 끝나요. 여러 사람을 보려면 한 사람씩 조회해서 합쳐요.
- 값 앞뒤의 공백은 지우고 해석해요. 빈 값이나 공백뿐인 값은 조회하기 전에 오류로 끝나요.

### 상위 업무로 찾기

`--parent` 는 그 업무의 하위 업무만 보여 줘요. 이렇게 줄 수 있어요.

- 이 프로젝트의 업무 번호: `42`
- 다른 프로젝트의 업무: `<project>/<number>`
- postId

### 기간으로 찾기

`--created` 는 등록 기간, `--updated` 는 수정 기간이에요. 둘 다 아래 꼴을 받아요.

| 꼴 | 뜻 |
| --- | --- |
| `A~B` | A 부터 B 까지 |
| `A~` | A 이후 |
| `~B` | B 이전 |
| `prev-<N>d` | 최근 N일 (N 은 1 이상) |

- A 와 B 는 `2026-09-01` 같은 날짜나 `2026-09-01T09:00:00+09:00` 같은 일시예요.
- 날짜만 주면 A 는 그 날 0시, B 는 그 날 23시 59분 59초로 봐요.
- 없는 날짜나 끝이 시작보다 앞선 범위는 조회하기 전에 오류로 끝나요.
- `~` 로 시작하는 값은 셸이 홈 디렉터리로 바꾸려 해요. `--created "~2026-09-30"` 처럼 따옴표로 감싸요.

### 정렬

`--order` 는 `createdAt`, `postUpdatedAt`, `postDueAt` 중 하나를 받아요.
앞에 `-` 를 붙이면 내림차순이고, 기본은 `-createdAt`(최신순)이에요.

## 업무와 위키 고치기

### 위키 페이지 본문 고치고 옮기기

페이지 ID 하나만 있으면 project 없이 고칠 수 있어요.

```bash
dooray wiki page edit --id <page-id> --body-file notes.md   # 본문 전체 바꾸기
dooray wiki page move --id <page-id> --parent <parent-page-id>
dooray wiki page move --id <page-id> --parent <parent-page-id> --no-children
```

`move` 는 하위 페이지도 함께 옮겨요. 페이지만 옮기려면 `--no-children` 을 줘요.

### 본문 일부만 고치기

`post edit --body` 와 `wiki page edit --body` 는 본문 전체를 바꿔요.
긴 본문에서 한두 군데만 고칠 때는 `replace` 로 바꿀 구간만 줘요.

```bash
dooray post replace <project> 42 --old "2. 배포" --new "2. 카나리 배포"
dooray wiki page replace --id <page-id> --old-file old.md --new-file new.md
```

고치기 전에 `--dry-run` 으로 어디가 바뀌는지 먼저 볼 수 있어요.

```bash
dooray post replace <project> 42 --old "v1.2" --new "v1.3" --all --dry-run
```

`--dry-run` 은 수정하지 않고 바뀌는 줄만 diff 형식으로 보여 줘요.

`--old` 가 어떻게 맞는지 알아 두면 좋아요.

- 공백과 줄바꿈까지 정확히 일치해야 해요.
- 여러 줄이거나 따옴표가 섞이면 `--old-file` 과 `--new-file` 로 줘요.
- 일치하는 곳이 없으면 종료 코드 3 으로 멈춰요.
- 두 군데 이상이면 몇 군데인지 알리고 멈춰요. 앞뒤 문맥을 더 넣어서 한 군데만 일치하게 하거나, `--all` 로 모두 바꿔요.
- 구간을 지우려면 `--new ""` 를 줘요.

제목, 담당자, 태그, 본문 형식은 그대로 둬요.
치환 때문에 첨부나 인라인 이미지 참조가 사라지면 확인을 받아요. 자동화에서는 `--no-confirm` 으로 넘겨요.

내부 동작은 이래요. 현재 본문을 읽어서 바꾼 뒤 전체를 다시 보내요.
그 사이에 다른 사람이 같은 본문을 고치면 그 수정을 덮어써요.
stdin 과 파일 입력의 세부 규칙은 [자세히](#replace-입력-규칙)에 있어요.

### 참조자와 담당자만 바꾸기

참조자·담당자 옵션만 주면 편집기를 열지 않아요.
기존 제목, 본문, 태그는 그대로 두고 참여자만 바꿔요.

```bash
dooray post edit <project> 42 --cc-group <group-code>  # 참조자 그룹 추가
```

### 본문 형식

업무, 댓글, 위키 페이지의 본문은 마크다운이거나 HTML 이에요.
`post edit`, `post comment edit`, `wiki page edit` 는 수정할 때 기존 형식을 그대로 유지해요.

주는 본문의 형식이 기존과 다르면 `--mime-type` 으로 알려 줘요.
빠뜨리면 마크다운 본문이 HTML 로 저장돼서 웹에서 원문이 그대로 보여요.

```bash
dooray post get <project> 42 --json | jq .body.mimeType    # "text/html"
dooray post edit <project> 42 --body-file notes.md --mime-type text/x-markdown
dooray post edit <project> 42 --mime-type text/html        # 본문은 그대로, 형식만 되돌리기
```

- 값은 `text/x-markdown` 과 `text/html` 두 가지뿐이에요.
- 본문을 바꾸지 않고 형식만 바꾸면 본문을 변환하지 않는다는 경고가 나와요.

### 멘션과 업무 링크

`post edit` 과 `post comment edit` 는 본문에 멘션과 다른 업무 링크를 붙여요.

```bash
dooray post edit <project> 42 --title "배포 준비" --mention 홍길동
dooray post comment edit <project> 42 --comment-id <comment-id> --body "확인 부탁" --link-task <project>/7
```

| 옵션 | 동작 |
| --- | --- |
| `--mention <name>` | 이름으로 멤버를 찾아 본문 앞에 멘션을 붙여요. 여러 번 줄 수 있어요 |
| `--mention-group <code>` | 그룹 코드로 찾아 멘션을 붙여요. 여러 번 줄 수 있어요 |
| `--link-task <ref>` | 다른 업무 링크를 본문 끝에 붙여요. `<project>/<number>` 나 postId 를 받고 여러 번 줄 수 있어요 |
| `--dry-run` | API 를 부르지 않고 합쳐진 본문만 보여 줘요 |

- `post edit` 에서 `--mention` 이나 `--link-task` 만 주면 편집기를 열지 않고 기존 본문에 붙여서 수정해요.
- `--dry-run` 을 붙이면 수정하지 않고 합쳐진 본문만 출력해요.

본문 형식이 `text/html` 이면 이 세 옵션을 쓸 수 없어요.
멘션과 링크의 HTML 표기를 확인하지 못했기 때문이에요. 종료 코드 3 으로 멈추고 `--mime-type text/x-markdown` 으로 형식을 바꾸는 방법을 안내해요.

## 파일 다루기

### 댓글에 파일 붙이기

```bash
dooray post comment file upload <project> <number> <comment-id> <path>
```

- 이미지 확장자는 이미지 마크다운으로, 그 외 파일은 일반 링크로 댓글 본문에 추가해요.
- 웹에서 올린 첨부와 CLI 로 올린 파일은 `comment file list` 에 함께 나오고 `출처` 열로 구분해요.
- CLI 로 올린 파일은 댓글의 첨부 카드가 아니라 본문 링크로 보여요.

본문 형식에 따라 멈추는 경우가 있어요.

- `comment file upload` 는 댓글 본문이 `text/html` 이면 파일을 올리기 전에 종료 코드 3 으로 멈춰요. 첨부 표기를 확인하지 못해서, 올려도 본문에서 그 파일을 찾을 수 없기 때문이에요.
- `comment file delete` 는 댓글 본문에서 그 파일의 참조를 찾지 못하면 종료 코드 3 으로 멈춰요. 이때 본문도 파일도 건드리지 않아요. 파일만 지우려면 `dooray post file delete` 를 써요.

### 첨부 파일 내려받기

한 업무의 첨부를 모두 받으려면 `download-all` 을 써요.

```bash
dooray post file download-all <project> 42 -o ./files
dooray post file download-all <project> 42 -o ./files --no-inline
```

- 첨부 목록의 파일과 본문에 삽입된 파일을 함께 받아요.
- 본문에 이미지를 붙여 넣기만 한 업무는 첨부 목록이 비어 있어도 그 이미지를 받아요.
- 본문 쪽을 빼려면 `--no-inline` 을 줘요.

파일 하나만 받으려면 파일 id 를 넣어요.

```bash
dooray post file download <project> 42 <file-id> -o ./files
dooray post file download <project> 42 <file-id> --output-file ./files/보고서.pdf
dooray post comment file download <project> 42 <comment-id> <file-id> --output-file ./보고서.pdf
dooray wiki page file download <project> <page-id> <file-id> --output-file ./가이드.pdf
```

- `-o` 는 저장할 폴더(기본은 현재 폴더)를 정해요. 파일 이름은 원본 이름을 써요.
- `--output-file <path>` 는 저장할 파일 경로를 직접 정해요. 부모 폴더가 없으면 만들어요.
- 둘을 함께 주면 폴더 옵션을 무시하고 stderr 로 경고해요. 댓글 첨부의 폴더 옵션은 `--out` 이에요.
- `download-all` 에는 `--output-file` 이 없어요.
- `--json` 은 세 명령 모두 `{ outputPath, fileName, size }` 를 내요. 명령 앞뒤 어디에 둬도 돼요.

저장 이름을 정하는 규칙은 [자세히](#내려받은-파일의-저장-이름)에 있어요.

## 지우기

아래 삭제 명령은 실수로 지우지 않도록 확인을 거쳐요.

| 영역 | 삭제 명령 |
| --- | --- |
| 업무 | `dooray post comment delete`<br>`dooray post file delete`<br>`dooray post comment file delete` |
| 위키 | `dooray wiki page delete`<br>`dooray wiki page file delete`<br>`dooray wiki page comment delete` |

- 터미널에서는 기본값이 아니오인 `y/N` 확인을 물어요. 아니오를 고르면 API 를 부르지 않고 취소해요.
- 스크립트나 파이프처럼 터미널이 아닌 곳에서는 `-y` 또는 `--yes` 를 줘서 확인을 건너뛰어야 해요.
- 이 옵션이 없으면 삭제 API 를 부르기 전에 종료 코드 3 으로 끝나요. 기존 삭제 자동화에는 `--yes` 를 추가해요.

`post comment delete` 와 `post file delete` 는 `--json` 과 `--quiet` 을 받아요.

- `--json` 은 지운 식별자와 `status` 를 내요.
- `--quiet` 은 식별자 한 줄만 내요.
- 식별자의 키 이름은 명령마다 달라요. 댓글 삭제는 `commentId`, 파일 삭제는 `fileId` 예요.

## 프로젝트 태그 만들기

업무에 붙일 태그를 CLI 에서 만들 수 있어요.

```bash
dooray project tags <project>                                    # 태그 목록
dooray project tags create <project> --name "배포환경:staging"    # 그룹에 속한 태그
dooray project tags create <project> --name "긴급" --color c6eab3  # 그룹 없는 태그
dooray project tags group <project> "배포환경" --select-one        # 그룹에서 하나만 고르게
```

- `--name` 은 `"그룹명:태그명"` 꼴이에요. 그룹명은 생략할 수 있어요.
- 같은 그룹명으로 여러 번 만들면 그 그룹에 태그가 쌓여요.
- `--color` 를 생략하면 회색이 붙어요.

`group` 은 그룹의 설정을 바꿔요.

- 필수 여부: `--mandatory`, 해제는 `--no-mandatory`
- 단일 선택 여부: `--select-one`, 해제는 `--no-select-one`
- 지정하지 않은 쪽은 그대로 둬요.
- 태그가 하나도 없는 그룹은 바꿀 수 없어요.

프로젝트 코드가 `list`, `create`, `group` 중 하나와 같으면 그 값이 하위 명령으로 먼저 읽혀요.
이때는 `dooray project tags list <project>` 로 목록을 조회해요.

태그 이름·색상 수정과 태그 삭제는 Dooray API 에 경로가 없어서 웹 설정 화면에서 해요.

## 자세히

사용에는 필요하지 않지만 동작을 정확히 알고 싶을 때 보는 내용이에요.

### replace 입력 규칙

- `-` 는 stdin 이에요. `--old` 와 `--new` 가 함께 stdin 을 쓸 수는 없어요.
- 파일과 stdin 으로 준 값은 UTF-8 BOM 과 끝 줄바꿈 하나를 떼고 써요. 에디터나 `echo` 가 붙인 줄바꿈 때문에 어긋나지 않게 하려는 거예요.
- 끝 줄바꿈까지 일치시켜야 하면 인자로 줘요. 예: `--old $'마지막 줄\n'`
- 파일이나 stdin 으로 읽은 `--new` 가 비어 있으면 앞 명령이 실패한 것과 구분할 수 없어서 종료 코드 3 으로 멈춰요. 구간을 지우려면 인자로 `--new ""` 를 줘요.
- `--dry-run` 에서 탭은 그대로 보이고 CR 은 `<CR>` 로 보여요.
- `--dry-run` 은 긴 줄을 바뀐 곳 앞뒤 80자만 남기고 `...` 로 줄여요. 잘린 줄은 그대로 복사해서 `--old` 로 쓸 수 없어요.

### 내려받은 파일의 저장 이름

- 서버가 보낸 `Content-Disposition` 에서 이름을 풀어 NFC 로 정규화해요.
- 이름을 풀지 못하거나 255바이트를 넘으면 첨부 목록의 이름을 써요.
- 그것도 안 되면 `<file-id>.<확장자>` 로 저장해요.
