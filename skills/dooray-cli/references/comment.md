# comment

## 댓글 추가

```bash
dooray post comment add <project> <number> --body "댓글 내용"
dooray post comment add <project> <number> --body-file ./comment.md
```

본문이 비었거나 공백뿐이면 등록하지 않고 종료 코드 3 으로 끝난다. `--json` 은 `{"id": "<comment-id>"}` 를, `--quiet` 은 댓글 id 만 낸다.

## 목록 필터

| 옵션 | 동작 |
| --- | --- |
| `--sort <asc\|desc>` | 정렬. 기본 `asc` |
| `--reverse` | `--sort desc` 의 alias |
| `--latest <n>` | 최신 N개. `--sort desc` 와 `--size N` 을 합친 단축이며 최대 100 |
| `--since <iso>` | 이 시각 이후만. ISO 8601 또는 `YYYY-MM-DD` |
| `--from-author <name>` | 작성자 이름 부분일치 |
| `--page <n>` / `--size <n>` | 페이지 번호와 크기. 기본 0 과 20 |

```bash
dooray post comment list <project> <number> --latest 5
dooray post comment list <project> <number> --since 2026-04-27
dooray post comment list <project> <number> --from-author 홍길동
```

table 출력은 Creator 컬럼을 프로젝트 멤버 캐시로 채운다. `--json` 은 raw 응답을 유지한다.

## 단일 댓글 본문 가져오기

`post comment get <project> <number> <comment-id> --json` 으로 본문과 댓글 조회 API가 노출한 파일을 `attachments`로 받는다.
웹 UI에서 직접 첨부한 파일은 누락될 수 있다.
`comment list` 를 받아 jq 로 필터링할 필요가 없다.

상세 파일 조작 규칙과 대체 확인 경로는 [post.md](post.md)를 따른다.

본문을 고칠 때는 이 순서로 한다.

1. `dooray post comment get <p> <n> <id> --json | jq -r '.body.content' > current.md`
2. 파일을 편집한다
3. `dooray post comment edit <p> <n> <id> --body-file current.md --no-confirm`

주는 본문의 형식이 기존과 다르면 3번에 `--mime-type` 을 함께 준다. 값은 `text/x-markdown` 과 `text/html` 이다.

3번의 `--no-confirm` 은 첨부 보호 확인을 건너뛴다. 본문에서 기존 첨부 markdown 을 지우지 않았을 때만 쓴다.

## 댓글 첨부와 본문 형식

댓글 본문의 형식에 따라 두 명령이 멈추는 조건이 있다.

- `post comment file upload` 는 댓글 본문이 `text/html` 이면 파일을 올리기 전에 종료 코드 3 으로 멈춘다.
  그 형식의 첨부 표기가 확인되지 않아, 올려도 본문에서 그 파일에 닿을 수 없다
- `post comment file delete` 는 본문에서 그 파일의 참조를 찾지 못하면
  본문도 파일도 건드리지 않고 종료 코드 3 으로 멈춘다.
  파일만 지우려면 `dooray post file delete <project> <number> <file-id>` 를 쓴다

`post comment edit` 의 `--mention` 과 `--mention-group` 과 `--link-task` 도
본문이 `text/html` 이면 같은 종료 코드로 멈춘다. 표기는 [mention-link.md](mention-link.md) 를 읽는다.
