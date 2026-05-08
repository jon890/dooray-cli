# Phase 02 — 4 명령에 헬퍼 적용 + 빌드 검증 + 완료 마킹

## 변경 파일 (정확)

```bash
# cwd: /Users/nhn/personal/dooray-cli
git diff <base>..HEAD --name-only -- src/commands/post/comment/file/ tasks/025-refactor-comment-file-input-helper/
```

기대 결과 (총 5 파일):
```
src/commands/post/comment/file/delete.ts
src/commands/post/comment/file/download.ts
src/commands/post/comment/file/list.ts
src/commands/post/comment/file/upload.ts
tasks/025-refactor-comment-file-input-helper/index.json
```

## 작업 항목

### 1. 4 명령 — 자체 분기 로직 제거 + `resolveCommentFileInput` 호출

각 파일의 action 안에서 자체 if/else 분기 (50~80 줄) 를 다음 패턴으로 교체:

```ts
import { resolveCommentFileInput } from "../../../../resolvers/comment-file-input.js";

.action(async (arg1, arg2, arg3, arg4, opts) => {
  const globalOpts = uploadCommand.optsWithGlobals() as OutputOptions;
  const config = await getConfigOrThrow();
  const client = new DoorayApiClient(config.apiKey, config.baseUrl);

  const { projectId, postId, commentId, secondary } = await resolveCommentFileInput(client, {
    arg1, arg2, arg3, arg4,
    idOpt: opts.id,
    urlOpt: opts.url,
    commentIdOpt: opts.commentId,
    secondaryOpt: opts.file,        // upload: --file. download/delete: --file-id. list: undefined
    requireSecondary: true,         // list 만 false
  });

  // 명령별 후속 동작 — uploadPostCommentFile / list / download / delete
});
```

**명령별 차이**:
| 명령 | secondaryOpt | requireSecondary |
|---|---|---|
| upload | `opts.file` | true |
| download | `opts.fileId` | true |
| delete | `opts.fileId` | true |
| list | (undefined) | false |

**중요**: 옵션 정의 (Commander `.option(...)`) 와 인자 시그니처 (`[arg1] ... [arg4]`) 는 **그대로 유지** — 사용자 호환성. action 내부 분기만 헬퍼로 위임.

### 2. 동작 실증 (executor)

각 명령의 두 모드 (positional + `--id` 모드) 가 그대로 동작하는지 1 사이클 검증:

```bash
# cwd: /Users/nhn/personal/dooray-cli
pnpm build

# 1. positional 모드 (회귀 테스트 — 변경 전과 동일 동작)
node dist/index.js post comment file list <project> <post-number> <comment-id>

# 2. --id 모드
node dist/index.js post comment file list --id <postId> --comment-id <comment-id>

# 3. upload + download + delete 1 사이클 (PR #40 의 실증과 동일)
```

### 3. 마지막 phase — index.json 완료 마킹

```bash
# cwd: /Users/nhn/personal/dooray-cli
sed -i '' 's/"status": "pending"/"status": "completed"/g' tasks/025-refactor-comment-file-input-helper/index.json
grep -c '"status": "completed"' tasks/025-refactor-comment-file-input-helper/index.json
# 기대: 3 (root + phases 2)
```

## 성공 기준

```bash
# cwd: /Users/nhn/personal/dooray-cli
pnpm build && pnpm test

# 4 명령 모두 헬퍼 호출
grep -cE "resolveCommentFileInput" src/commands/post/comment/file/{list,upload,download,delete}.ts
# 기대: 4

# 자체 분기 제거 — arg2, arg3 의 if 분기 키워드 (예: opts.id || opts.url) 가 action body 에서 제거됐는지
grep -cE "if \(opts\.id \|\| opts\.url\)" src/commands/post/comment/file/{list,upload,download,delete}.ts
# 기대: 0 (헬퍼로 위임됐으면 모두 사라짐)

# index.json 완료
grep -c '"status": "completed"' tasks/025-refactor-comment-file-input-helper/index.json
# 기대: 3
```

## 작업 외 금지

- 옵션 시그니처 변경 금지 (호환성)
- 4 명령 외 다른 명령에 헬퍼 적용 금지
- comment 가 아닌 post 본문 file 명령에는 적용 금지 (별도 plan 가능)

## 커밋

```bash
# cwd: /Users/nhn/personal/dooray-cli
# branch: feat/025-refactor-comment-file-input-helper
git add src/commands/post/comment/file/list.ts src/commands/post/comment/file/upload.ts src/commands/post/comment/file/download.ts src/commands/post/comment/file/delete.ts tasks/025-refactor-comment-file-input-helper/index.json
git commit -m "refactor(commands): use resolveCommentFileInput in comment file commands

Issue #41: replace per-command argv branching (~50 lines × 4) with
single helper call. Option signatures preserved (no breaking change).
Mark task 025 completed."
```
