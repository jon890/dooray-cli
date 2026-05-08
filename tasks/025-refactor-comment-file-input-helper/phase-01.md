# Phase 01 — `resolveCommentFileInput` 헬퍼 신설 + tests

## 컨텍스트

GitHub Issue #41 — PR #40 에 추가된 `post comment file` 4 명령이 각자 positional / `--id` / `--url` / `--comment-id` / `--file` / `--file-id` 분기 로직을 자체 구현. 옵션 B (헬퍼 추출) 채택.

코드 현황:
- `src/commands/post/comment/file/{list,upload,download,delete}.ts` — 각각 자체 분기 보유
- `src/resolvers/post-input.ts` — `resolvePostInput` (post 식별 분기) 의 호출 주체. 본 헬퍼는 그 위에 comment-file 추가 인자 (commentId / secondPositional) 를 합쳐 결과 반환

```bash
# cwd: /Users/nhn/personal/dooray-cli
git log origin/main --oneline -10 -- src/commands/post/comment/file/ src/resolvers/post-input.ts
```

## 변경 파일 (정확)

```bash
# cwd: /Users/nhn/personal/dooray-cli
git diff <base>..HEAD --name-only -- src/resolvers/comment-file-input.ts src/resolvers/comment-file-input.test.ts
```

기대 결과 (총 2 파일, 신규):
```
src/resolvers/comment-file-input.ts
src/resolvers/comment-file-input.test.ts
```

## 작업 항목

### 1. `src/resolvers/comment-file-input.ts`

`resolvePostInput` 을 내부 호출하면서 추가 positional (commentId, secondaryArg = path / fileId) 분기 처리. 4 명령이 모두 `<project> <post-number> <comment-id> [<secondary>]` 또는 `--id <postId> --comment-id <id> [--file <path> | --file-id <id>]` 형식으로 입력받음.

```ts
import { DoorayApiClient } from "../api/client.js";
import { resolvePostInput } from "./post-input.js";
import { DoorayCliError } from "../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../utils/exit-codes.js";

export interface CommentFileInputArgs {
  // positional 4 인자 (action 의 arg1~arg4 원본 그대로 전달)
  arg1?: string;
  arg2?: string;
  arg3?: string;
  arg4?: string;
  // 옵션
  idOpt?: string;
  urlOpt?: string;
  commentIdOpt?: string;
  // secondary positional 의 옵션 폴백 (file path / fileId 중 명령마다 다름 — caller 가 결정)
  secondaryOpt?: string;
  // secondary 인자가 필수인지 (list 는 false, upload/download/delete 는 true)
  requireSecondary: boolean;
}

export interface CommentFileInputResult {
  projectId: string;
  postId: string;
  commentId: string;
  secondary?: string;        // path 또는 fileId
}

export async function resolveCommentFileInput(
  client: DoorayApiClient,
  args: CommentFileInputArgs,
): Promise<CommentFileInputResult> {
  const isOptionMode = !!(args.idOpt || args.urlOpt);

  let projectArg: string | undefined;
  let postNumberArg: string | undefined;
  let commentId: string | undefined = args.commentIdOpt;
  let secondary: string | undefined = args.secondaryOpt;

  if (isOptionMode) {
    // 옵션 모드: positional 은 (commentId, secondary) 순으로 폴백
    if (!commentId) commentId = args.arg1;
    if (!secondary) secondary = args.arg2;
    if (args.arg3 || args.arg4) {
      throw new DoorayCliError(
        "--id/--url 모드에서는 추가 positional 인자가 허용되지 않습니다.",
        EXIT_PARAM_ERROR,
      );
    }
  } else {
    // positional 모드: <project> <post-number> <comment-id> [<secondary>]
    projectArg = args.arg1;
    postNumberArg = args.arg2;
    if (!commentId) commentId = args.arg3;
    if (!secondary) secondary = args.arg4;
  }

  if (!commentId) {
    throw new DoorayCliError("<comment-id> 가 필요합니다.", EXIT_PARAM_ERROR);
  }
  if (args.requireSecondary && !secondary) {
    throw new DoorayCliError(
      "secondary positional (path 또는 fileId) 가 필요합니다.",
      EXIT_PARAM_ERROR,
    );
  }

  const { projectId, postId } = await resolvePostInput(client, {
    projectArg,
    postNumberArg,
    idOpt: args.idOpt,
    urlOpt: args.urlOpt,
  });

  return { projectId, postId, commentId, secondary };
}
```

### 2. `src/resolvers/comment-file-input.test.ts` — 단위 테스트 (총 6 케이스)

DoorayApiClient mock 으로 `resolvePostInput` 만 우회하고 분기 로직 자체 검증. 또는 분기 로직만 export 한 pure 헬퍼 신설 후 테스트.

권장 패턴: 분기 로직만 다음 함수로 분리하여 mock 없이 테스트:

```ts
// (export 추가)
export interface CommentFilePositionalResult {
  projectArg?: string;
  postNumberArg?: string;
  commentId: string;
  secondary?: string;
}

export function parseCommentFilePositional(
  args: Omit<CommentFileInputArgs, never>,
): CommentFilePositionalResult { /* 위 분기 로직만 */ }
```

테스트:
```ts
describe("parseCommentFilePositional", () => {
  it("positional 4 모드 — secondary 있음", () => { /* arg1=p arg2=n arg3=c arg4=s → {p, n, c, s} */ });
  it("positional 3 모드 — secondary 없음 (list)", () => { /* requireSecondary=false → secondary undefined OK */ });
  it("--id 모드 — arg1=commentId", () => { /* idOpt + arg1=c → {commentId: c} */ });
  it("--id 모드 + --comment-id 우선", () => { /* idOpt + commentIdOpt + arg1=c → commentIdOpt 우선 */ });
  it("--id 모드 + arg3 있으면 에러", () => { /* idOpt + arg3 → throw */ });
  it("commentId 미입력 — 에러", () => { /* nothing → throw */ });
});
```

## 성공 기준

```bash
# cwd: /Users/nhn/personal/dooray-cli
pnpm build && pnpm test

grep -nE "export (async )?function (resolveCommentFileInput|parseCommentFilePositional)" src/resolvers/comment-file-input.ts
# 기대: 2줄

grep -cE "^\s*it\(" src/resolvers/comment-file-input.test.ts
# 기대: 6
```

## 작업 외 금지

- 4 명령에 헬퍼 적용 금지 — phase-02 에서
- `resolvePostInput` 시그니처 변경 금지
- ADR 추가 금지 (ADR-020 의 자연스러운 확장)

## 커밋

```bash
# cwd: /Users/nhn/personal/dooray-cli
# branch: feat/025-refactor-comment-file-input-helper
git add src/resolvers/comment-file-input.ts src/resolvers/comment-file-input.test.ts
git commit -m "feat(resolvers): add resolveCommentFileInput helper

Issue #41 (phase 1/2): centralize comment-file positional / option
branching. parseCommentFilePositional pure helper for testability."
```
