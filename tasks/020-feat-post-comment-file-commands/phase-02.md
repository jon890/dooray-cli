# Phase 02 — `post comment file` 4개 명령 구현 + Commander 등록

## 컨텍스트

Phase-01 의 4종 API 메서드 (uploadPostCommentFile/listPostCommentFiles/downloadPostCommentFile/deletePostCommentFile) 를 사용하는 CLI 명령 추가.

명령 시그니처 (Issue #34 제안 그대로):

```
dooray post comment file upload   <project> <post-number> <comment-id> <path>
dooray post comment file list     <project> <post-number> <comment-id>
dooray post comment file download <project> <post-number> <comment-id> <file-id>
dooray post comment file delete   <project> <post-number> <comment-id> <file-id>
```

`<comment-id>` (logId) 는 Dooray 가 부여한 19자리 numeric ID. `dooray post comment list <project> <post-number>` 로 조회 가능.

코드 현황 — 참조 패턴:
- `src/commands/post/file/upload.ts` / `list.ts` / `download.ts` / `delete.ts` — post file 4종 명령. argv 분기 (positional vs `--id`/`--url`) + spinner + JSON/quiet 분기 모두 갖춤
- `src/commands/post/comment/edit.ts` — `<project> <post-number> <comment-id>` 3-positional 패턴 + `--id`/`--url` 분기 예시
- `src/index.ts` — Commander 트리 등록 위치

직전 plan 과의 관계: 016 (post 12-command input 통합) 가 `--id`/`--url`/positional URL 분기를 `resolvePostInput` 헬퍼로 통일. 신규 명령도 동일 헬퍼 사용.

## 변경 파일 (정확)

```bash
# cwd: /Users/nhn/personal/dooray-cli
git diff <base>..HEAD --name-only -- src/commands/post/comment/ src/index.ts
```

기대 결과 (총 5 파일):
```
src/commands/post/comment/file/upload.ts        (신규)
src/commands/post/comment/file/list.ts          (신규)
src/commands/post/comment/file/download.ts      (신규)
src/commands/post/comment/file/delete.ts        (신규)
src/index.ts                                    (Commander 등록)
```

## 작업 항목

### 1. 신규 디렉터리 + 4개 명령 파일

`src/commands/post/comment/file/` 디렉터리 생성.

각 파일은 대응하는 `src/commands/post/file/*.ts` 를 참조하여 작성하되, comment-id 인자가 추가되는 차이만 반영:

#### 1-1. `upload.ts`

```ts
import { Command } from "commander";
// imports — post/file/upload.ts 와 동일 (client, resolvePostInput, spinner, errors, formatters)

export const commentFileUploadCommand = new Command("upload")
  .description("댓글 첨부파일 업로드")
  .argument("[arg1]", "프로젝트 코드, Dooray URL, 또는 (`--id`/`--url` 모드일 때) comment-id")
  .argument("[arg2]", "업무 번호 또는 (`--id`/`--url` 모드일 때) comment-id 의 다음 위치")
  .argument("[arg3]", "comment-id (positional 모드)")
  .argument("[arg4]", "파일 경로 (positional 모드)")
  .option("--id <postId>", "Dooray post ID")
  .option("--url <url>", "Dooray 업무 URL")
  .option("--comment-id <id>", "comment ID (positional 대체)")
  .option("--file <path>", "업로드할 파일 경로 (positional 대체)")
  .action(async (arg1, arg2, arg3, arg4, opts) => {
    const globalOpts = commentFileUploadCommand.optsWithGlobals() as OutputOptions;
    /* 분기: opts.id || opts.url 이면 (commentId, filePath) 가 (arg1, arg2) 또는 (--comment-id, --file)
              아니면 (project, postNumber, commentId, filePath) 가 (arg1..arg4) 또는 (--comment-id, --file 보조)
              resolvePostInput 으로 (projectId, postId) 획득 → uploadPostCommentFile 호출 */
    formatPostFile(uploadResult, globalOpts);
  });
```

#### 1-2. `list.ts` — `<project> <post-number> <comment-id>` 또는 `--id <postId> --comment-id <id>`. table/JSON/quiet 출력.

#### 1-3. `download.ts` — `<project> <post-number> <comment-id> <file-id>`. `-o, --output <dir>` 지원 (기본 `.`).

#### 1-4. `delete.ts` — `<project> <post-number> <comment-id> <file-id>`.

각 명령 작성 시 `src/commands/post/file/{upload,list,download,delete}.ts` 를 1:1 참조하여 동일 출력 포맷 / 에러 처리 / spinner 사용 유지.

### 2. `src/index.ts` — Commander 트리 등록

기존 `post comment` 그룹 아래에 `file` 서브그룹을 끼워 넣음:

```ts
// 기존: const commentCommand = new Command("comment").description("...");
//        commentCommand.addCommand(commentAddCommand);
//        ...

const commentFileCommand = new Command("file").description("댓글 첨부파일 관련 명령");
commentFileCommand.addCommand(commentFileUploadCommand);
commentFileCommand.addCommand(commentFileListCommand);
commentFileCommand.addCommand(commentFileDownloadCommand);
commentFileCommand.addCommand(commentFileDeleteCommand);

commentCommand.addCommand(commentFileCommand);
```

import 4건 추가.

### 3. resolvePostInput 호환성

기존 `resolvePostInput({ projectArg, postNumberArg, idOpt, urlOpt })` 시그니처 그대로 사용. comment-id 는 별도 인자로 받음 (resolver 와 무관).

argv 분기 패턴은 `src/commands/post/file/upload.ts` 와 정확히 동일하게 따라가서 critic 의 "분기 룰 일관성" 지적 회피.

### 4. 동작 실증 (필수)

phase-01 의 API 메서드 검증을 위해 executor 가 빌드 후 1 사이클 실제 호출:

```bash
# cwd: /Users/nhn/personal/dooray-cli
pnpm build

# 실증 시나리오 (executor 가 실행 — 사용자가 config 셋업한 환경 가정)
# 1. 임시 댓글 생성
COMMENT_ID=$(node dist/index.js post comment add <project> <post-number> --body "test" --json | jq -r '.id')
# 2. 파일 업로드
node dist/index.js post comment file upload <project> <post-number> $COMMENT_ID /tmp/test.txt
# 3. 목록 확인
node dist/index.js post comment file list <project> <post-number> $COMMENT_ID
# 4. 다운로드
node dist/index.js post comment file download <project> <post-number> $COMMENT_ID <file-id> -o /tmp
# 5. 삭제
node dist/index.js post comment file delete <project> <post-number> $COMMENT_ID <file-id>
# 6. 댓글 삭제 (정리)
node dist/index.js post comment delete <project> <post-number> $COMMENT_ID
```

**executor 메모**: 위 시나리오를 본 phase 의 검증으로 수행. 사용자가 config 셋업 안 했을 가능성 → executor 가 `dooray doctor` 로 인증 확인 후 진행. 인증 안 되어 있으면 사용자에게 물어보고 그 단계만 스킵 가능.

## 성공 기준

```bash
# cwd: /Users/nhn/personal/dooray-cli

# 1. 빌드 + 테스트 통과
pnpm build && pnpm test
# 기대: exit 0

# 2. 4개 명령 파일 생성
ls src/commands/post/comment/file/{upload,list,download,delete}.ts
# 기대: 4개 모두 존재

# 3. Commander 등록
grep -nE "commentFileCommand|commentFileUploadCommand|commentFileListCommand" src/index.ts
# 기대: 5줄 이상 (정의 + 4 addCommand)

# 4. dist 번들에 명령 들어감 (CLI help 확인)
node dist/index.js post comment file --help 2>&1 | grep -cE "^\s+(upload|list|download|delete)\b"
# 기대: 4

# 5. resolvePostInput 사용 일관성
grep -cn "resolvePostInput" src/commands/post/comment/file/*.ts
# 기대: 4 이상 (4 파일 각 1 이상)

# 6. (실증 통과 시) executor 메모: upload→list→download→delete 1 사이클 성공
```

## 작업 외 금지

- post 본문 file 명령 (`src/commands/post/file/*`) 변경 금지 — 본 phase scope 외
- 댓글 본문 자동 markdown 삽입 (`![](/files/<id>)` 자동 append) 금지 — 별도 enhancement
- comment cache 도입 금지
- ADR 추가 금지

## 커밋

```bash
# cwd: /Users/nhn/personal/dooray-cli
# branch: feat/020-feat-post-comment-file-commands
git add src/commands/post/comment/file/ src/index.ts
git commit -m "feat(commands): add post comment file 4 commands (upload/list/download/delete)

Issue #34: expose comment attachment API as post comment file *.
Mirror post file commands; comment-id is the additional positional arg.
Reuses resolvePostInput for project/post-number/--id/--url branching."
```
