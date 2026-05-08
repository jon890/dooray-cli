# Phase 02 — `post comment get` 명령 + formatter + tests

## 컨텍스트

phase-01 의 `getPostCommentDetail` 을 사용하는 CLI 명령. ADR-020 분기 (positional / `--id` / `--url`) + 추가 `--comment-id` 옵션.

코드 현황:
- `src/commands/post/comment/edit.ts:18-50` — `<arg1> <arg2> <arg3>` + `--id`/`--url`/`--comment-id` 분기 패턴 (그대로 답습)
- `src/commands/post/comment/list.ts` — table/JSON/quiet 출력 패턴
- `src/formatters/` — comment 전용 formatter 없음 (list 의 enrich 만 있음)

## 변경 파일 (정확)

```bash
# cwd: /Users/nhn/personal/dooray-cli
git diff <base>..HEAD --name-only -- src/commands/post/comment/get.ts src/formatters/comment.ts src/index.ts
```

기대 결과 (총 3 파일):
```
src/commands/post/comment/get.ts       (신규)
src/formatters/comment.ts              (신규 — 단일 댓글 detail 포매터)
src/index.ts                           (Commander 등록)
```

## 작업 항목

### 1. `src/commands/post/comment/get.ts` — 명령 정의

`comment edit.ts` 의 argv 분기 패턴 그대로 답습 (commentId 결정 로직). action 안에서:

```ts
const detail = await client.getPostCommentDetail(projectId, postId, commentId);
formatCommentDetail(detail.result, globalOpts, projectId, client);
```

옵션:
- `[arg1]` / `[arg2]` / `[arg3]` (positional)
- `--id <postId>` / `--url <url>` (post 식별)
- `--comment-id <id>` (positional 대체)

### 2. `src/formatters/comment.ts` — `formatCommentDetail`

table 모드: 댓글 메타 (id / 작성자 / 시각 / mimeType) + body 본문 + attachments 목록 (있으면).
JSON 모드: `printJson(comment)`.
quiet 모드: id 만.

작성자 이름 enrich 는 기존 `comment-enrich.ts` 패턴 답습 (project member cache).

```ts
export async function formatCommentDetail(
  comment: PostComment,
  opts: OutputOptions,
  projectId: string,
  client: DoorayApiClient,
): Promise<void> {
  if (opts.json) { printJson(comment); return; }
  if (opts.quiet) { process.stdout.write(comment.id + "\n"); return; }
  // table 모드 — chalk + cli-table3 사용
  // 1. 메타 표 (Field / Value)
  // 2. 본문 (구분선 후 raw markdown)
  // 3. attachments (있으면 별도 표)
}
```

### 3. `src/index.ts` — Commander 등록

기존 `commentCommand` 그룹에 `commentGetCommand` 추가:

```ts
import { commentGetCommand } from "./commands/post/comment/get.js";
// ...
commentCommand.addCommand(commentGetCommand);
```

### 4. 동작 실증 (executor)

```bash
# cwd: /Users/nhn/personal/dooray-cli
pnpm build

# positional
node dist/index.js post comment get <project> <post-number> <comment-id>

# --id 모드
node dist/index.js post comment get --id <postId> --comment-id <comment-id>

# --url 모드
node dist/index.js post comment get --url "<dooray-task-url>" --comment-id <comment-id>

# --json 자동화 호환성
node dist/index.js post comment get <project> <post-number> <comment-id> --json | jq -r '.body.content'
```

## 성공 기준

```bash
# cwd: /Users/nhn/personal/dooray-cli
pnpm build && pnpm test
# 기대: exit 0

# 명령 파일 + formatter 추가
ls src/commands/post/comment/get.ts src/formatters/comment.ts
# 기대: 둘 다 존재

# Commander 등록
grep -nE "commentGetCommand" src/index.ts
# 기대: 2줄 (import + addCommand)

# CLI help 노출
node dist/index.js post comment --help 2>&1 | grep -cE "^\s+get\b"
# 기대: 1
```

## 작업 외 금지

- comment edit/list 변경 금지 (이번 phase scope 외)
- comment cache 도입 금지
- attachment 인라인 미리보기 (이미지 렌더 등) 금지
- ADR 추가 금지

## 커밋

```bash
# cwd: /Users/nhn/personal/dooray-cli
# branch: feat/024-feat-post-comment-get
git add src/commands/post/comment/get.ts src/formatters/comment.ts src/index.ts
git commit -m "feat(commands): add post comment get for single-comment fetch

Issue #45: positional <project> <post-number> <comment-id> + ADR-020
branching (--id / --url + --comment-id). table / JSON / quiet outputs.
Creator name enriched via existing comment-enrich pattern."
```
