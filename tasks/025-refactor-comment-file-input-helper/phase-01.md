# Phase 01 — `resolveCommentFileInput` 헬퍼 신설 + tests

## 컨텍스트

GitHub Issue #41 — PR #40 에 추가된 `post comment file` 4 명령이 각자 positional / `--id` / `--url` / `--comment-id` / `--file` / `--file-id` 분기 로직을 자체 구현. 옵션 B (헬퍼 추출) 채택.

코드 현황 (action body 실측 줄 수, `wc -l`):
- `src/commands/post/comment/file/list.ts` — 71 줄, **`.argument` 3개** (`[arg1] [arg2] [arg3]`)
- `src/commands/post/comment/file/upload.ts` — 88 줄, `.argument` 4개 (`[arg1]~[arg4]`)
- `src/commands/post/comment/file/download.ts` — 58 줄, `.argument` 4개
- `src/commands/post/comment/file/delete.ts` — 98 줄, `.argument` 4개
- `src/resolvers/post-input.ts` — `resolvePostInput` (post 식별 분기) 의 호출 주체. 본 헬퍼는 그 위에 comment-file 추가 인자 (commentId / secondPositional) 를 합쳐 결과 반환

**중요한 시그니처 차이 (phase-02 적용 시 주의)**: `list.ts` 만 argument 3개 → action callback 시그니처가 `(arg1, arg2, arg3, opts) =>`. 나머지 3개는 4개 → `(arg1, arg2, arg3, arg4, opts) =>`. phase-02 가 헬퍼 호출 패턴을 적용할 때 list 만 별도 시그니처로 처리해야 한다 (Commander 는 선언된 argument 수만큼만 callback 인자를 전달; 4개로 통일하면 `arg4` 자리에 opts 가 들어가 `opts.id` 가 항상 undefined → 런타임 회귀).

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

**핵심 설계 결정**: 분기 로직은 pure 함수 `parseCommentFilePositional` 로 분리 (mock 없이 단위 테스트), client orchestration 은 `resolveCommentFileInput` 가 담당. 두 함수 모두 export.

**caller-specific 에러 메시지 보존 (MAJOR)**: 4 명령은 `--file` (upload) / `--file-id` (download/delete) / 없음 (list) 으로 옵션 이름이 다름 → `secondaryLabel` 인자로 caller 가 메시지 customize. ADR-020 의 `resolvePostInput` 가 caller-agnostic 했던 것은 식별자가 1종(`<post-number>`)이라 가능했고, 여기는 옵션명이 갈리므로 일반화 부적절.

```ts
import { DoorayApiClient } from "../api/client.js";
import { resolvePostInput } from "./post-input.js";
import { DoorayCliError } from "../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../utils/exit-codes.js";

export interface CommentFileSecondaryLabel {
  /** positional 위치 설명 — 예: "4번째" */
  positional: string;
  /** 옵션 이름 — 예: "--file", "--file-id" */
  option: string;
  /** 식별자 표기 — 예: "<path>", "<fileId>" */
  identifier: string;
}

export interface CommentFileInputArgs {
  // positional 4 인자 원본 (action 의 arg1~arg4)
  arg1?: string;
  arg2?: string;
  arg3?: string;
  arg4?: string;
  // 옵션
  idOpt?: string;
  urlOpt?: string;
  commentIdOpt?: string;
  // secondary positional 의 옵션 폴백 (file path / fileId 중 명령마다 다름)
  secondaryOpt?: string;
  // secondary 인자가 필수인지 (list = false, upload/download/delete = true)
  requireSecondary: boolean;
  // 누락 시 에러 메시지에 들어갈 caller-specific 라벨 (requireSecondary=true 일 때 필수)
  secondaryLabel?: CommentFileSecondaryLabel;
}

export interface CommentFilePositionalResult {
  projectArg?: string;
  postNumberArg?: string;
  commentId: string;
  secondary?: string;
}

export interface CommentFileInputResult {
  projectId: string;
  postId: string;
  commentId: string;
  secondary?: string;
}

/** 분기 로직 pure 헬퍼 — client 호출 없이 단위 테스트 가능. */
export function parseCommentFilePositional(
  args: CommentFileInputArgs,
): CommentFilePositionalResult {
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
    throw new DoorayCliError(
      "<comment-id> 가 필요합니다. positional 3번째 또는 --comment-id 옵션을 사용하세요.",
      EXIT_PARAM_ERROR,
    );
  }
  if (args.requireSecondary && !secondary) {
    const label = args.secondaryLabel;
    const msg = label
      ? `${label.identifier} 가 필요합니다. positional ${label.positional} 또는 ${label.option} 옵션을 사용하세요.`
      : "secondary positional 이 필요합니다.";
    throw new DoorayCliError(msg, EXIT_PARAM_ERROR);
  }

  return { projectArg, postNumberArg, commentId, secondary };
}

export async function resolveCommentFileInput(
  client: DoorayApiClient,
  args: CommentFileInputArgs,
): Promise<CommentFileInputResult> {
  const { projectArg, postNumberArg, commentId, secondary } =
    parseCommentFilePositional(args);

  const { projectId, postId } = await resolvePostInput(client, {
    projectArg,
    postNumberArg,
    idOpt: args.idOpt,
    urlOpt: args.urlOpt,
  });

  return { projectId, postId, commentId, secondary };
}
```

### 2. `src/resolvers/comment-file-input.test.ts` — 단위 테스트 (총 9 케이스)

`parseCommentFilePositional` 만 대상 (client mock 불요). 핵심 분기 + 에러 메시지 customization 까지 커버.

```ts
import { describe, it, expect } from "vitest";
import { parseCommentFilePositional } from "./comment-file-input.js";

const fileLabel = { positional: "4번째", option: "--file", identifier: "<path>" };

describe("parseCommentFilePositional", () => {
  it("positional 4 모드 — secondary 있음", () => { /* arg1=p arg2=n arg3=c arg4=s, requireSecondary=true → {projectArg:p, postNumberArg:n, commentId:c, secondary:s} */ });
  it("positional 3 모드 — list (requireSecondary=false, secondary undefined OK)", () => { /* arg1=p arg2=n arg3=c, requireSecondary=false → secondary undefined */ });
  it("--id 모드 — arg1=commentId", () => { /* idOpt + arg1=c, requireSecondary=false → {commentId:c} */ });
  it("--url 모드 — arg1=commentId, arg2=secondary 폴백", () => { /* urlOpt + arg1=c arg2=s, requireSecondary=true, secondaryLabel=fileLabel → {commentId:c, secondary:s} */ });
  it("--id 모드 + --comment-id 옵션 우선", () => { /* idOpt + commentIdOpt=c2 + arg1=c1 → commentId=c2 */ });
  it("옵션 모드 + --file 옵션 폴백 (positional 미입력)", () => { /* idOpt + commentIdOpt=c + secondaryOpt=s + arg1/arg2 undef → {commentId:c, secondary:s} */ });
  it("--id 모드 + arg3 있으면 에러", () => { /* idOpt + arg3=x → throw EXIT_PARAM_ERROR */ });
  it("commentId 미입력 — 에러", () => { /* {} → throw with --comment-id 안내 */ });
  it("requireSecondary=true + secondary 누락 — secondaryLabel 메시지 사용", () => { /* arg1=p arg2=n arg3=c, requireSecondary=true, secondaryLabel=fileLabel → throw with --file 안내 포함 */ });
});
```

## 성공 기준

```bash
# cwd: /Users/nhn/personal/dooray-cli
pnpm build && pnpm test

grep -nE "export (async )?function (resolveCommentFileInput|parseCommentFilePositional)" src/resolvers/comment-file-input.ts
# 기대: 2줄

grep -cE "^\s*it\(" src/resolvers/comment-file-input.test.ts
# 기대: 9
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
