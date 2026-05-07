# Phase 02 — 4 명령 구현 (list/upload/download/delete) + Commander 등록

## 컨텍스트

phase-01 의 `getPostComment` + `appendFileReference`/`removeFileReference` 위에 4 명령을 구현. ADR-024 의 합성 동작:

| 명령 | 내부 호출 |
|---|---|
| `list <comment-id>` | `getPostComment(...).result.files` 반환 |
| `upload <comment-id> <path>` | (1) `uploadPostFile` (2) `getPostComment` → body 추출 → `appendFileReference` → `updatePostComment` |
| `download <comment-id> <file-id>` | `downloadPostFile` (post file download 와 동일 — UX 일관성 wrapper) |
| `delete <comment-id> <file-id>` | (1) `getPostComment` → `removeFileReference` → `updatePostComment`, (2) `deletePostFile` |

전 명령은 ADR-020 의 `<project> <post-number>` / `--id <postId>` / `--url <url>` / 첫 positional URL 분기를 `resolvePostInput` 헬퍼로 통일.

**positional 시그니처 — `comment/edit.ts` (L17-80) 모드 의존 패턴 답습** (절대 4·5번째 positional 추가 금지):

| 모드 | arg1 | arg2 | arg3 | arg4 |
|---|---|---|---|---|
| positional 모드 | `<project>` | `<post-number>` | `<comment-id>` | `<path>` 또는 `<file-id>` (해당 명령) |
| `--id`/`--url` 모드 | `<comment-id>` | `<path>`/`<file-id>` | (금지) | (금지) |

옵션 폴백 강제: `--comment-id <id>` / `--file <path>` (upload) / `--file-id <id>` (download/delete). list 는 4 번째 인자 없음 (3개까지).

분기 검증 — `--id`/`--url` 모드에서 arg3·arg4 가 들어오면 `EXIT_PARAM_ERROR` 명시적 reject (edit.ts L48-54 그대로 답습).

### 먼저 읽을 파일

- `src/commands/post/file/list.ts` — `getPostFiles` + table/json 출력 (대칭 base)
- `src/commands/post/file/upload.ts` — `uploadPostFile` + multipart + 결과 출력
- `src/commands/post/file/download.ts` — stream write + 출력 경로 결정
- `src/commands/post/file/delete.ts` — confirm 옵션 + DELETE
- `src/resolvers/post-input.ts` — `<project> <post-number>` / `--id` / `--url` 분기 (`resolvePostInput`)
- `src/commands/post/comment/edit.ts` (L94-145) — `getPostComments` 후 본문 갱신 패턴 답습
- `src/commands/post/index.ts` — 서브커맨드 등록 위치

## 작업 항목 (5개)

### 1) `src/commands/post/comment/file/list.ts` (신규)

```
dooray post comment file list <project> <post-number> <comment-id>
dooray post comment file list --id <postId> --comment-id <logId>
dooray post comment file list --url <url> --comment-id <logId>
```

동작:
1. `resolvePostInput` 으로 `{ projectId, postId }` 획득
2. `<comment-id>` 는 positional 3 번째 (positional 모드) / arg1 (`--id`/`--url` 모드) / `--comment-id` 옵션
3. `client.getPostComment(projectId, postId, logId)` 호출
4. `const files = res.result.files ?? []` (optional 필드 — 폴백 필수)

**출력 형식** (ADR-021 table-only enrich 정신 답습 — `--json` 은 raw 유지):
- table (기본): 3 컬럼 `이름 | 크기(human, e.g. "12.4 KB") | id`. **"등록 시각" 컬럼은 데이터 없음 (`PostCommentFile = { id, name, size }` 뿐) → 추가 금지**
- `--json`: `res.result.files ?? []` 그대로 출력 (raw)
- `--quiet`: 출력 생략
- 빈 배열: stderr `'첨부 없음'` 한 줄 + stdout 비움 (`--json` 은 `[]` 출력)

`post/file/list.ts` 의 `OutputOptions` 처리 / human size 헬퍼 / 빈 결과 메시지 패턴 답습.

### 2) `src/commands/post/comment/file/upload.ts` (신규)

```
dooray post comment file upload <project> <post-number> <comment-id> <path>
dooray post comment file upload --id <postId> --comment-id <logId> --file <path>
```

동작 (2-step):
1. `resolvePostInput` → `{ projectId, postId }`
2. `<comment-id>` + `<path>` 결정 (positional 우선, 없으면 옵션)
3. **step 1**: `client.uploadPostFile(projectId, postId, filePath)` → `{ result: { id, name, ... } }` 획득
4. **step 2**: `client.getPostComment(...)` → `currentBody = res.result.body.content` (mimeType=`text/x-markdown`)
5. `newBody = appendFileReference(currentBody, fileName, fileId)`
6. `client.updatePostComment(projectId, postId, logId, { body: { mimeType: "text/x-markdown", content: newBody }})`
7. **step 1 성공 + step 2 실패** 처리: `throw new DoorayCliError("업로드 OK / 댓글 reference 추가 실패. fileId=<id> — 'dooray post comment file delete' 또는 수동 PUT 으로 정리하세요.", EXIT_API_ERROR)`. 코드베이스는 `DoorayCliError` throw 단일 패턴 (`src/utils/errors.ts`) — `process.exit` 직접 호출 금지.

성공 시 stdout (`--quiet` 아니면) 한 줄: `업로드 + 댓글 reference 추가: fileId=...`. `--json` 이면 `{ fileId, fileName, commentId }` JSON.

### 3) `src/commands/post/comment/file/download.ts` (신규)

```
dooray post comment file download <project> <post-number> <comment-id> <file-id> [--out <path>]
```

동작: `client.downloadPostFile(projectId, postId, fileId)` 호출 후 `--out` 또는 cwd 에 저장. `post/file/download.ts` 의 file write 패턴 그대로 답습 — **comment-id 는 받지만 download API 호출에는 사용 안 함**. UX 일관성 목적이므로 positional 받지만 무시 (warning 없음). `--out` 미지정 시 cwd 에 fileName 그대로.

`--help` description 에 한 줄 명시: `"댓글에 첨부된 파일 다운로드 (현재 comment-id 는 미사용 — 멘탈 모델 일관성, 미래 댓글 단위 권한 호환용)"`.

> 왜 commentId 를 받기만 하고 안 쓰는가: 사용자 멘탈 모델 ("그 댓글의 그 파일") 일관성 + 미래에 Dooray 가 댓글 단위 권한 도입할 가능성 → 인자만 받아두면 호환. 현재는 단순 wrapper.

### 4) `src/commands/post/comment/file/delete.ts` (신규)

```
dooray post comment file delete <project> <post-number> <comment-id> <file-id> [--yes]
```

동작 (2-step):
1. `resolvePostInput` → `{ projectId, postId }`
2. `<comment-id>` + `<file-id>` 결정
3. `--yes` 미지정이면 confirm prompt (`@inquirer/prompts confirm`) — 본문 markdown 제거 + 파일 삭제 안내 (post 단의 다른 댓글에서 같은 fileId 참조 시 broken 됨을 명시)
4. **step 1**: `getPostComment` → `removeFileReference(body, fileId)` → `updatePostComment` (본문 갱신)
5. **step 2**: `deletePostFile(projectId, postId, fileId)`
6. step 1 성공 + step 2 실패 → `throw new DoorayCliError("댓글 본문 reference 제거 OK / 파일 삭제 실패. 'dooray post file delete' 로 후처리하세요. fileId=<id>", EXIT_API_ERROR)` (`process.exit` 직접 호출 금지 — `DoorayCliError` throw 단일 패턴).

`post/file/delete.ts` 의 confirm 패턴 답습.

### 5) `src/commands/post/comment/file/index.ts` + `src/index.ts` 등록

**중요**: `src/commands/post/comment/index.ts` 는 **존재하지 않음**. `commentCommand` 는 `src/index.ts` (L86-92) 에서 직접 조립됨. 그러므로 등록은 `src/index.ts` 에서 한다.

`src/commands/post/comment/file/index.ts` (신규):
```ts
import { Command } from "commander";
import { listCommentFileCommand } from "./list.js";
import { uploadCommentFileCommand } from "./upload.js";
import { downloadCommentFileCommand } from "./download.js";
import { deleteCommentFileCommand } from "./delete.js";

export const commentFileCommand = new Command("file")
  .description("댓글 첨부 파일 관리 (post-level files API + 댓글 PUT 합성, ADR-024)")
  .addCommand(listCommentFileCommand)
  .addCommand(uploadCommentFileCommand)
  .addCommand(downloadCommentFileCommand)
  .addCommand(deleteCommentFileCommand);
```

`src/index.ts` 수정:
1. import 추가: `import { commentFileCommand } from "./commands/post/comment/file/index.js";`
2. L91 (`commentCommand.addCommand(commentDeleteCommand);`) 다음, **L92 (`postCommand.addCommand(commentCommand);`) 직전** 에 한 줄 추가:
   ```ts
   commentCommand.addCommand(commentFileCommand);
   ```

기존 `fileCommand` 등록 패턴 (L95-101) 의 형태 답습 — `commentFileCommand` 는 `commentCommand` 의 자식이라는 점만 차이.

## 성공 기준

```bash
# cwd: /Users/nhn/personal/dooray-cli

# 1. 빌드 + 테스트 통과
pnpm run build && pnpm test

# 2. 신규 4 명령 파일
ls src/commands/post/comment/file/{list,upload,download,delete,index}.ts | wc -l | tr -d ' '
# 기대: 5

# 3. Commander 등록
node dist/index.js post comment file --help 2>&1 | grep -cE "^  (list|upload|download|delete)\b"
# 기대: 4

# 4. 각 서브커맨드 --help 통과 (인자 시그니처 확인)
for sub in list upload download delete; do
  node dist/index.js post comment file $sub --help >/dev/null 2>&1 && echo "$sub OK"
done
# 기대: 4 줄 OK

# 5. resolvePostInput 사용 확인 (4 명령 모두 ADR-020 input 패턴 답습)
grep -lE "resolvePostInput" src/commands/post/comment/file/{list,upload,download,delete}.ts | wc -l | tr -d ' '
# 기대: 4

# 6. appendFileReference / removeFileReference 호출
grep -nE "appendFileReference\(" src/commands/post/comment/file/upload.ts
grep -nE "removeFileReference\(" src/commands/post/comment/file/delete.ts
# 기대: 각 1줄
```

## 작업 외 금지

- `getPostComment` 시그니처 변경 — phase-01 산출물 그대로
- 다중 파일 업로드 (multipart 다중) — 단일 파일만. 호출자 (스킬) 가 반복 책임
- README/SKILL.md 갱신 — phase-03 에서
- ADR 추가 — ADR-024 만으로 충분
- `post file *` 4 명령 (기존) 변경 금지 — 회귀 위험

## 주의사항 (common-pitfalls 사전 소진)

- **CLI1 (exitCode)**: 모든 catch 분기 `EXIT_API_ERROR` 또는 `EXIT_PARAM_ERROR`. step 1 성공 + step 2 실패도 명시적 non-zero
- **CLI2 (HTTP 클라이언트)**: 모든 호출은 `DoorayApiClient` 경유 — ky only
- **CLI5 (`as Type`)**: `getPostComment` 응답에서 `res.result.body.content` 추출 — 타입 generic 으로 안전. `as` 단언 0
- **CLI6 (markdown body)**: `appendFileReference` 가 phase-01 에서 `[]` 이스케이프 처리 완료
- **stdout vs stderr**: 데이터 (json / table) 는 stdout, spinner / "업로드 중..." / "댓글 갱신 중..." 진행 메시지는 stderr (spinner 모듈 사용 — `--json`/`--quiet` 시 자동 억제)
- **PII**: 코드/명령 예시 모두 `<project>` / `<postId>` / `<logId>` placeholder 또는 dummy `1234567890123456789` 만

## Blocked 조건

- `getPostComment` 응답의 `body.mimeType` 이 markdown 외 (예: `text/html`) → 본 plan 스코프 외, error 한 줄 + skip
- 사용자가 다중 파일을 `<path>` 에 glob 으로 지정 → "단일 파일만 지원" 에러 + 안내
