# comment

업무 댓글 추가, 목록 필터, 단일 댓글 본문 조회를 다룬다.

### 댓글 추가 (non-interactive)

```bash
dooray post comment add <project> <number> --body "댓글 내용"
dooray post comment add <project> <number> --body-file ./comment.md
```


### 댓글 목록 필터 (non-interactive)

```bash
# 최신 5개
dooray post comment list <project> <number> --latest 5
# 특정 날짜 이후
dooray post comment list <project> <number> --since 2026-04-27
# 작성자 필터
dooray post comment list <project> <number> --from-author 홍길동
# 최신 댓글 1개 빠른 조회
dooray post comment latest <project> <number>
```


---

## 단일 댓글 본문 fetch

`post comment get <project> <post-number> <comment-id> --json` 으로 단일 댓글의 본문 + attachments 를 곧장 fetch. `comment list` 후 jq 필터링 우회 불필요.

본문 patch 흐름:
1. `dooray post comment get <p> <n> <id> --json | jq -r '.body.content' > current.md`
2. (편집)
3. `dooray post comment edit <p> <n> <id> --body-file current.md --no-confirm` (attachment guard 통과)

---

