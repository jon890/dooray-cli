# comment

## 댓글 추가

```bash
dooray post comment add <project> <number> --body "댓글 내용"
dooray post comment add <project> <number> --body-file ./comment.md
```

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

`post comment get <project> <number> <comment-id> --json` 으로 본문과 attachments 를 곧바로 받는다.
`comment list` 를 받아 jq 로 걸러낼 필요가 없다.

본문을 고칠 때는 이 순서로 한다.

1. `dooray post comment get <p> <n> <id> --json | jq -r '.body.content' > current.md`
2. 파일을 편집한다
3. `dooray post comment edit <p> <n> <id> --body-file current.md --no-confirm`

3번의 `--no-confirm` 은 첨부 보호 확인을 건너뛴다. 본문에서 기존 첨부 markdown 을 지우지 않았을 때만 쓴다.
