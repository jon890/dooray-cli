# Phase 01 — `post comment get` 명령 + formatter + argv 단위 테스트

## 컨텍스트

GitHub Issue #45 — 단일 댓글 ID 로 fetch. 기존에는 `getPostComments` (목록) 만 명령에 노출, 사용자가 jq 로 필터링 우회.

**중요 — API 메서드 + 타입은 이미 존재**:
- `src/api/client.ts:300-309` — `getPostComment(projectId, postId, logId): Promise<PostCommentDetailResponse>` (단일 댓글)
- `src/api/types.ts:332` — `export type PostCommentDetailResponse = DoorayApiResponse<PostComment>;`
- 본 phase 는 client / types 변경 **없음** — CLI 노출만 신설.

코드 현황:
- `src/commands/post/comment/edit.ts:18-50` — `<arg1> <arg2> <arg3>` + `--id`/`--url`/`--comment-id` 분기 패턴 답습 대상
- `src/commands/post/comment/list.ts` — table/JSON/quiet 출력 패턴 + creator enrich 패턴
- `src/utils/comment-enrich.ts` — `enrichCommentCreators(comments, nameMap)` (배열 받음 — 단일도 `[c]` 로 감싸 호출)
- `src/formatters/` (member.ts/post.ts/table.ts/wiki.ts) — 4 파일 모두 client 비의존 순수 포매터. 본 phase 도 이 컨벤션 유지

```bash
# cwd: /Users/nhn/personal/dooray-cli
grep -nE "getPostComment\b|PostCommentDetailResponse" src/api/client.ts src/api/types.ts
# 기대: 4~5 건 (이미 구현됨 검증)
```

## 변경 파일 (정확)

```bash
# cwd: /Users/nhn/personal/dooray-cli
git diff <base>..HEAD --name-only -- src/commands/post/comment/get.ts src/commands/post/comment/get.test.ts src/formatters/comment.ts src/index.ts
```

기대 결과 (총 4 파일):
```
src/commands/post/comment/get.ts          (신규)
src/commands/post/comment/get.test.ts     (신규 — argv 분기 단위 테스트)
src/formatters/comment.ts                 (신규 — formatCommentDetail, client 비의존)
src/index.ts                              (commentGetCommand 등록)
```

## 작업 항목 (4개)

### 1. `src/formatters/comment.ts` — `formatCommentDetail` (client 비의존)

다른 formatters 와 동일하게 client 받지 않음. 명령 안에서 enrich 끝낸 plain 데이터만 받는다.

```ts
import type { PostComment } from "../api/types.js";
import type { OutputOptions } from "./table.js";
import { printJson } from "./table.js";

// table 모드: 댓글 메타 (id / 작성자 / 시각 / mimeType) + body 본문 + attachments 목록 (있으면)
// JSON 모드: printJson(comment)
// quiet 모드: id 만 stdout
export function formatCommentDetail(comment: PostComment, opts: OutputOptions): void {
  if (opts.json) { printJson(comment); return; }
  if (opts.quiet) { process.stdout.write(comment.id + "\n"); return; }
  // table 모드 — chalk + cli-table3 사용 (기존 list.ts / member.ts 패턴 답습)
  // 1. 메타 표 (Field / Value)
  // 2. 본문 (구분선 후 raw markdown — body.content)
  // 3. attachments (있으면 별도 표: name / size / id)
}
```

**creator 이름 enrich 는 명령 측 책임** — `enrichCommentCreators([c], nameMap)[0]` 결과를 formatter 에 전달.

### 2. `src/commands/post/comment/get.ts` — 명령 정의

`comment edit.ts` 의 argv 분기 패턴 답습 (`resolvePostInput` + `--comment-id` 분기). action 안에서:

```ts
import { Command } from "commander";
import { getConfigOrThrow } from "../../../config/store.js";
import { DoorayApiClient } from "../../../api/client.js";
import { resolvePostInput } from "../../../resolvers/post-input.js";
import { buildMemberNameMap } from "../../../resolvers/member.js";
import { enrichCommentCreators } from "../../../utils/comment-enrich.js";
import { formatCommentDetail } from "../../../formatters/comment.js";
import type { OutputOptions } from "../../../formatters/table.js";
import { DoorayCliError } from "../../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../../utils/exit-codes.js";

export const commentGetCommand = new Command("get")
  .description("단일 댓글 본문 + 메타 + attachments 조회")
  .argument("[arg1]", "프로젝트 코드 / Dooray URL / 댓글 ID (모드별)")
  .argument("[arg2]", "업무 번호 / 댓글 ID (모드별)")
  .argument("[arg3]", "댓글 ID (positional 모드)")
  .option("--id <postId>", "Dooray post ID (positional 대신)")
  .option("--url <url>", "Dooray 업무 URL (positional 대신)")
  .option("--comment-id <id>", "댓글 ID (arg3 대신)")
  .action(async (arg1, arg2, arg3, opts) => {
    // argv 분기 — comment edit.ts 와 동일
    // 1) --id / --url 모드: --comment-id 필수
    // 2) positional 3개 모드: arg1=project, arg2=postNumber, arg3=commentId
    // commentId 결정 후 resolvePostInput → projectId + postId
    // 충돌 검증: positional 과 --id/--url/--comment-id 동시 입력 시 EXIT_PARAM_ERROR

    const config = await getConfigOrThrow();
    const client = new DoorayApiClient(config);
    const globalOpts = commentGetCommand.optsWithGlobals() as OutputOptions;

    const { projectId, postId } = await resolvePostInput(client, { /* ... */ });
    const commentId = /* ... */;

    const detail = await client.getPostComment(projectId, postId, commentId);
    let comment = detail.result;
    if (!globalOpts.json) {
      // table / quiet 모드만 enrich (--json 은 raw 유지 — comment list 와 동일 정책)
      const nameMap = await buildMemberNameMap(client, projectId);
      comment = enrichCommentCreators([comment], nameMap)[0]!;
    }
    formatCommentDetail(comment, globalOpts);
  });
```

**중요 동작 명세**:
- `--json` 모드: enrich 없이 raw 응답 (comment list 와 동일 정책)
- `--quiet` 모드: id 만 stdout
- 404 (commentId 미존재): `getPostComment` 의 `toDoorayCliError` 가 처리 — 별도 핸들링 불필요
- positional + `--id/--url/--comment-id` 동시 입력 → `DoorayCliError("...", EXIT_PARAM_ERROR)`

### 3. `src/commands/post/comment/get.test.ts` — argv 분기 단위 테스트

`src/resolvers/post-input.test.ts` 패턴 답습. 명령의 argv 파싱·분기 결정 로직을 helper 로 추출해 단위 테스트 (action 함수는 client 호출 모킹 부담 회피).

테스트 케이스 (vitest, 4 it() 이상):
1. positional 3개 → `{ project, postNumber, commentId }`
2. `--id` + `--comment-id` → `{ idOpt, commentId }`
3. `--url` + `--comment-id` → `{ urlOpt, commentId }`
4. positional + `--id` 동시 → throws `DoorayCliError(EXIT_PARAM_ERROR)`
5. (선택) `--id` 만 있고 `--comment-id` 누락 → throws `DoorayCliError(EXIT_PARAM_ERROR)`

argv 결정 로직은 get.ts 안에 export 하는 helper (`parseGetArgs(arg1, arg2, arg3, opts)`) 로 분리해 테스트 가능하게 한다.

### 4. `src/index.ts` — Commander 등록

기존 `commentCommand` 그룹 (post 하위) 에 `commentGetCommand` 추가:

```ts
import { commentGetCommand } from "./commands/post/comment/get.js";
// ...
commentCommand.addCommand(commentGetCommand);
```

기존 `commentCommand.addCommand(commentListCommand)` / `commentEditCommand` / 등 옆에 같은 패턴.

## 성공 기준

```bash
# cwd: /Users/nhn/personal/dooray-cli
pnpm build && pnpm test
# 기대: exit 0, 새 it() 4 건 이상 추가

ls src/commands/post/comment/get.ts src/commands/post/comment/get.test.ts src/formatters/comment.ts
# 기대: 3 파일 모두 존재

grep -nE "commentGetCommand" src/index.ts
# 기대: 2 줄 (import + addCommand)

# formatter client 비의존 검증 (CLI14)
grep -nE "DoorayApiClient" src/formatters/comment.ts
# 기대: 0 건

# CLI help 노출
node dist/index.js post comment --help 2>&1 | grep -cE "^\s+get\b"
# 기대: 1

# 새 단위 테스트 통과 + 케이스 수
grep -cE "^\s*it\(" src/commands/post/comment/get.test.ts
# 기대: 4 이상
```

## 작업 외 금지

- src/api/client.ts / src/api/types.ts 변경 금지 — 이미 구현됨
- comment edit/list 변경 금지
- comment cache 도입 금지
- attachment 인라인 미리보기 금지
- ADR 추가 금지

## 커밋

```bash
# cwd: /Users/nhn/personal/dooray-cli
# branch: feat/024-feat-post-comment-get
git add src/commands/post/comment/get.ts src/commands/post/comment/get.test.ts src/formatters/comment.ts src/index.ts
git commit -m "feat(commands): add post comment get for single-comment fetch

Issue #45: positional <project> <post-number> <comment-id> + ADR-020
branching (--id / --url + --comment-id). table / JSON / quiet outputs.
Uses pre-existing client.getPostComment + enrichCommentCreators.
Formatter is client-agnostic (CLI14 layer rule)."
```
