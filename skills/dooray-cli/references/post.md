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
```

`--dry-run --json` 으로 API 호출 없이 결과를 먼저 볼 수 있다.

```bash
dooray post edit --id "$POST_ID" --cc-group qa-team --dry-run --json | jq '.users.cc'
```

`$EDITOR` 로 여는 interactive 모드에서는 이 옵션들이 무시되고 경고만 나온다.

## 본문 수정은 전체 교체다 — 첨부가 사라질 수 있다

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

`comment file list`는 댓글 조회 API가 노출한 첨부만 보여주므로 웹 UI에서 직접 첨부한 파일을 놓칠 수 있다.
목록이 비어 있으면 `post file list`로 업무 전체 첨부를 확인한다.

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

## 부모 업무 지정

```bash
CHILD_ID=$(dooray post create <project> --title "subtask A" --json | jq -r '.id')
dooray post edit --id "$CHILD_ID" --title "subtask A" --parent <project>/<parent-number>
```

`--parent` 를 쓸 때 `--title` 이 필수다. 제목을 바꾸지 않으려면 원래 제목을 그대로 넣는다.
parent 해제는 API 가 지원하지 않아 CLI 로 할 수 없다 — 웹 UI 에서 처리한다.

## 태그만 바꾸기

`--title` 이나 `--body` 없이 태그 옵션만으로 호출할 수 있다. 기존 본문은 자동으로 다시 전송된다.

```bash
dooray post edit --id "$POST_ID" --tag "분류: 성능"
dooray post edit --id "$POST_ID" --tag-clear --tag "재분류"
dooray post edit --id "$POST_ID" --tag-remove "긴급"
```
