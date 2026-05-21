# Phase 02 — commands/wiki/page-file/ 5 명령 (list/upload/download/download-all/delete) + index.ts 등록

## 컨텍스트

Phase-01 에서 인프라 (`uploadWikiPageFile` / `downloadWikiPageFile` / `deleteWikiPageFile` + `resolveWikiPageInput` + wiki URL parser) 가 준비됐다.
본 phase 는 5 명령 파일 작성 + `index.ts` 의 `wikiPageCommand` 그룹 아래 `file` 서브그룹 등록.

**post file 명령 5종이 mirror 기준** — `src/commands/post/file/{list,upload,download,download-all,delete}.ts` 의 구조 + UX (옵션·positional 분기·에러 메시지·dry-run 미지원) 그대로 답습.

`wiki page file` 의 미러 차이점:
- input resolver: `resolvePostInput` → `resolveWikiPageInput`
- `--id` 모드: post 는 `--id <postId>` 단독으로 동작, wiki 는 `--project <code>` 동반 필요 (`getPageStandalone` 부재)
- list: `getPostFiles` 단일 호출 → `getWikiPage` 호출 후 `result.files` + `result.images` 합성 (각 행에 `type` 컬럼 추가)
- upload: `uploadPostFile(projectId, postId, filePath)` → `uploadWikiPageFile(wikiId, pageId, filePath, type)` + `--type general|inline_image` (기본 `general`) + stdout 에 attachFileId + 본문 삽입용 markdown snippet 안내 (inline_image 일 때만)

코드 컨텍스트:
- `src/commands/post/file/list.ts:1-49` — list 패턴
- `src/commands/post/file/upload.ts` — positional 3개 vs --file 분기 패턴
- `src/commands/post/file/download.ts` / `download-all.ts` / `delete.ts` — 출력 패턴
- `src/index.ts:115-119` — `wikiPageCommand` 그룹 (file 서브그룹 등록 지점)

## 변경 파일 (정확)

기대 결과 (총 7 파일):
```
src/commands/wiki/page-file/list.ts          (신규)
src/commands/wiki/page-file/upload.ts        (신규)
src/commands/wiki/page-file/download.ts      (신규)
src/commands/wiki/page-file/download-all.ts  (신규)
src/commands/wiki/page-file/delete.ts        (신규)
src/commands/wiki/page-file/index.ts         (신규 — 5 명령 조립 후 wikiPageFileCommand export)
src/index.ts                                 (수정 — wikiPageCommand.addCommand(wikiPageFileCommand) 한 줄 추가)
```

**planning docs (CLAUDE.md / docs/adr.md / docs/code-architecture.md / docs/prd.md / docs/flow.md) 는 task 생성 시점에 main 직접 commit 으로 선반영** — phase 안에서 추가 변경 금지.

## 작업 항목 (5개 이하)

### 1. `list.ts` — files[] + images[] 합성 + type 컬럼

```ts
import { Command } from "commander";
import { getConfigOrThrow } from "../../../config/store.js";
import { DoorayApiClient } from "../../../api/client.js";
import { resolveWikiPageInput } from "../../../resolvers/wiki-page-input.js";
import { output, type OutputOptions } from "../../../formatters/table.js";
import { startSpinner, stopSpinner } from "../../../utils/spinner.js";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export const wikiPageFileListCommand = new Command("list")
  .description("위키 페이지 첨부파일 목록 조회 (general + inline image)")
  .argument("[project]", "프로젝트 코드 (또는 첫 인자에 Dooray Wiki URL)")
  .argument("[page-id]", "위키 페이지 ID (project와 함께 사용)")
  .option("--id <pageId>", "위키 페이지 ID (--project 동반 필요)")
  .option("--url <url>", "Dooray Wiki URL")
  .option("--project <code>", "프로젝트 코드 (--id 모드에서 wikiId 해석용)")
  .action(async (project, pageIdArg, opts) => {
    const globalOpts = wikiPageFileListCommand.optsWithGlobals() as OutputOptions;
    const config = await getConfigOrThrow();
    const client = new DoorayApiClient(config.apiKey, config.baseUrl);

    // resolveWikiPageInput 을 spinner 보다 먼저 호출 (1-1 회피)
    const { wikiId, pageId } = await resolveWikiPageInput(client, {
      projectArg: project,
      pageIdArg,
      idOpt: opts.id,
      urlOpt: opts.url,
      project: opts.project,
    });

    startSpinner("첨부파일 목록 조회 중...");
    try {
      const res = await client.getWikiPage(wikiId, pageId);
      const files = (res.result.files ?? []).map((f) => ({ ...f, type: "general" as const }));
      const images = (res.result.images ?? []).map((f) => ({ ...f, type: "inline_image" as const }));
      const merged = [...files, ...images];
      stopSpinner(true, `첨부파일 ${merged.length}개 (general ${files.length} + inline ${images.length})`);

      output(globalOpts, {
        headers: ["ID", "Type", "파일명", "크기"],
        rows: merged.map((f) => [f.id, f.type, f.name, formatSize(f.size)]),
        raw: merged,
        ids: merged.map((f) => f.id),
      });
    } catch (e) {
      stopSpinner(false);
      throw e;
    }
  });
```

### 2. `upload.ts` — multipart type 강제 + inline_image snippet 안내

post upload 의 positional 분기 패턴 mirror. 추가: `--type general|inline_image` flag, inline 일 때 stdout 안내.

```ts
import { Command } from "commander";
import { getConfigOrThrow } from "../../../config/store.js";
import { DoorayApiClient } from "../../../api/client.js";
import { resolveWikiPageInput } from "../../../resolvers/wiki-page-input.js";
import { startSpinner, stopSpinner } from "../../../utils/spinner.js";
import { DoorayCliError } from "../../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../../utils/exit-codes.js";
import type { WikiPageFileType } from "../../../api/types.js";

export const wikiPageFileUploadCommand = new Command("upload")
  .description("위키 페이지 첨부파일 업로드 (multipart type 순서 강제, ADR-029)")
  .argument("[arg1]", "프로젝트 코드, Dooray Wiki URL, 또는 (`--id`/`--url` 모드일 때) 파일 경로")
  .argument("[arg2]", "page-id 또는 (`--id`/`--url` 모드일 때) 파일 경로")
  .argument("[arg3]", "파일 경로 (positional 3개 모드)")
  .option("--id <pageId>", "위키 페이지 ID")
  .option("--url <url>", "Dooray Wiki URL")
  .option("--project <code>", "프로젝트 코드 (--id 모드에서 wikiId 해석용)")
  .option("--file <path>", "업로드할 파일 경로 (positional 대체)")
  .option("--type <type>", "파일 타입: general | inline_image (기본 general)", "general")
  .action(async (arg1, arg2, arg3, opts) => {
    const config = await getConfigOrThrow();
    const client = new DoorayApiClient(config.apiKey, config.baseUrl);

    const fileType = opts.type as WikiPageFileType;
    if (fileType !== "general" && fileType !== "inline_image") {
      throw new DoorayCliError(
        `--type 은 general 또는 inline_image 여야 합니다 (입력: ${opts.type})`,
        EXIT_PARAM_ERROR,
      );
    }

    let projectArg: string | undefined;
    let pageIdArg: string | undefined;
    let filePath: string | undefined = opts.file;

    if (opts.id || opts.url) {
      if (arg2 || arg3) {
        throw new DoorayCliError(
          "--id/--url 모드에서는 파일 경로 외 positional 인자를 받지 않습니다. --file 옵션 사용을 권장합니다.",
          EXIT_PARAM_ERROR,
        );
      }
      filePath = filePath ?? arg1;
    } else if (arg3) {
      projectArg = arg1;
      pageIdArg = arg2;
      filePath = filePath ?? arg3;
    } else if (arg1 && !arg2) {
      projectArg = arg1;
      if (!filePath) {
        throw new DoorayCliError(
          "URL/--id 모드 외에서는 <project> <page-id> 둘 다 또는 --file 옵션이 필요합니다.",
          EXIT_PARAM_ERROR,
        );
      }
    } else {
      projectArg = arg1;
      pageIdArg = arg2;
      if (!filePath) {
        throw new DoorayCliError(
          "<file> 이 필요합니다. positional 3번째 또는 --file 옵션을 사용하세요.",
          EXIT_PARAM_ERROR,
        );
      }
    }

    if (!filePath) {
      throw new DoorayCliError("파일 경로가 필요합니다.", EXIT_PARAM_ERROR);
    }

    const { wikiId, pageId } = await resolveWikiPageInput(client, {
      projectArg,
      pageIdArg,
      idOpt: opts.id,
      urlOpt: opts.url,
      project: opts.project,
    });

    startSpinner(`파일 업로드 중... (${fileType})`);
    try {
      const res = await client.uploadWikiPageFile(wikiId, pageId, filePath, fileType);
      stopSpinner(true, "업로드 완료");

      process.stdout.write(`attachFileId: ${res.result.attachFileId}\n`);
      process.stdout.write(`name:         ${res.result.name}\n`);
      process.stdout.write(`size:         ${res.result.size}\n`);
      process.stdout.write(`type:         ${res.result.type}\n`);

      if (fileType === "inline_image") {
        process.stdout.write("\n본문 삽입용 markdown snippet (직접 wiki page edit 으로 본문에 박으세요):\n");
        process.stdout.write(`  ![${res.result.name}](/wikis/${wikiId}/files/${res.result.attachFileId})\n`);
      }
    } catch (e) {
      stopSpinner(false);
      throw e;
    }
  });
```

### 3. `download.ts` + `download-all.ts`

#### `download.ts` (단일 파일)

post `download.ts` 의 positional 분기 mirror. `client.downloadWikiPageFile` 호출 후 `writeFile`.

```ts
// 핵심 부분만 — 분기 로직은 post download mirror
const { wikiId, pageId } = await resolveWikiPageInput(client, { ... });

startSpinner("파일 다운로드 중...");
try {
  const { buffer, fileName } = await client.downloadWikiPageFile(wikiId, pageId, fileId);
  const outputPath = path.join(opts.output ?? ".", fileName);
  await writeFile(outputPath, Buffer.from(buffer));
  stopSpinner(true, `다운로드 완료: ${outputPath}`);
} catch (e) {
  stopSpinner(false);
  throw e;
}
```

옵션: `--file-id <id>` + `-o, --output <dir>` (post 와 동일).

#### `download-all.ts` (페이지 모든 첨부 + inline)

`getWikiPage` 로 `files[]` + `images[]` 합치고 모두 다운로드. post `download-all` 패턴 mirror.

```ts
const { wikiId, pageId } = await resolveWikiPageInput(client, { ... });

startSpinner("파일 목록 조회 중...");
let allFiles: WikiPageFile[];
try {
  const pageRes = await client.getWikiPage(wikiId, pageId);
  allFiles = [...(pageRes.result.files ?? []), ...(pageRes.result.images ?? [])];
} catch (e) {
  stopSpinner(false);
  throw e;
}

if (allFiles.length === 0) {
  stopSpinner(true, "첨부파일 없음");
  return;
}

stopSpinner(true, `${allFiles.length}개 파일 다운로드 시작`);
const outDir = opts.output ?? ".";
let successCount = 0;
const failures: { fileId: string; error: string }[] = [];
for (const f of allFiles) {
  try {
    const { buffer, fileName } = await client.downloadWikiPageFile(wikiId, pageId, f.id);
    await writeFile(path.join(outDir, fileName), Buffer.from(buffer));
    process.stdout.write(`✓ ${fileName}\n`);
    successCount++;
  } catch (e) {
    failures.push({ fileId: f.id, error: e instanceof Error ? e.message : String(e) });
    process.stderr.write(`✗ ${f.name} (${f.id}): ${e instanceof Error ? e.message : String(e)}\n`);
  }
}

process.stdout.write(`\n완료: ${successCount}/${allFiles.length}\n`);
if (failures.length > 0) {
  process.exit(1);
}
```

### 4. `delete.ts` — confirm 없이 즉시 (post file delete mirror)

```ts
// 핵심 — positional 분기는 post delete.ts mirror, confirm 없음
const { wikiId, pageId } = await resolveWikiPageInput(client, { ... });

startSpinner("파일 삭제 중...");
try {
  await client.deleteWikiPageFile(wikiId, pageId, fileId);
  stopSpinner(true, "삭제 완료");
  process.stdout.write(`파일(${fileId})이 삭제되었습니다.\n`);
} catch (e) {
  stopSpinner(false);
  throw e;
}
```

옵션: `--file-id <id>` + positional 3개 모드 (post 와 동일).

### 5. `index.ts` (서브그룹 조립) + `src/index.ts` 등록

`src/commands/wiki/page-file/index.ts`:

```ts
import { Command } from "commander";
import { wikiPageFileListCommand } from "./list.js";
import { wikiPageFileUploadCommand } from "./upload.js";
import { wikiPageFileDownloadCommand } from "./download.js";
import { wikiPageFileDownloadAllCommand } from "./download-all.js";
import { wikiPageFileDeleteCommand } from "./delete.js";

export const wikiPageFileCommand = new Command("file")
  .description("위키 페이지 첨부파일 관련 명령 (Issue #70, ADR-029)");

wikiPageFileCommand.addCommand(wikiPageFileListCommand);
wikiPageFileCommand.addCommand(wikiPageFileUploadCommand);
wikiPageFileCommand.addCommand(wikiPageFileDownloadCommand);
wikiPageFileCommand.addCommand(wikiPageFileDownloadAllCommand);
wikiPageFileCommand.addCommand(wikiPageFileDeleteCommand);
```

`src/index.ts:119` 직전에 추가:

```ts
import { wikiPageFileCommand } from "./commands/wiki/page-file/index.js";

// ... 기존 wikiPageCommand 조립 후:
wikiPageCommand.addCommand(wikiPageFileCommand);
wikiCommand.addCommand(wikiPageCommand);
```

## code-review-pitfalls 회피 항목

본 phase 는 5 신규 명령 — spinner / UX 관련 패턴 직격타.

- **1-1 (validation 전 spinner)**: 모든 명령에서 `resolveWikiPageInput` 호출을 `startSpinner` 보다 **앞**. positional / param 검증 throw 시 spinner leak 회피
- **1-2 (spinner 시작 후 try/catch 없이 API)**: 모든 명령에서 `startSpinner` 직후 try/catch 로 감싸고 catch 에서 `stopSpinner(false)` + re-throw
- **3-3 (테스트 mock mirror)**: 본 phase 명령들은 단위 테스트 없음 (실제 API 호출 통합 테스트는 phase-03 동작 실증으로 대체). 단 input 분기 로직은 phase-01 의 `wiki-page-input.test.ts` 가 커버
- **외과적 변경**: 기존 wiki / post 명령 동작 변경 금지. `src/index.ts` 는 `wikiPageCommand.addCommand(wikiPageFileCommand)` 한 줄 + import 한 줄만 추가
- **에러 메시지 일관성**: post file 명령들의 한국어 에러 메시지 톤·표현 그대로 답습 (사용자 학습 비용 감소)

## 성공 기준

```bash
# cwd: /Users/nhn/personal/dooray-cli

# 1. tsc + build + test
pnpm tsc --noEmit 2>&1 | grep -cE "^src/"
# 기대: 0
pnpm build && pnpm test
# 기대: exit 0 (phase-01 테스트 통과 유지)

# 2. 명령 5개 등록
node dist/index.js wiki page file --help 2>&1 | grep -cE "^  (list|upload|download|download-all|delete)"
# 기대: 5

# 3. 각 명령 help 출력 (option 노출 확인)
node dist/index.js wiki page file upload --help 2>&1 | grep -cE "\-\-(type|file|id|url|project)"
# 기대: 5 이상

# 4. spinner ↔ resolveWikiPageInput 순서 (1-1 회피 검증)
for f in src/commands/wiki/page-file/{list,upload,download,download-all,delete}.ts; do
  awk '/\.action\(async/,/^  \}\)\;/' "$f" | \
    grep -nE "(startSpinner|resolveWikiPageInput)" | head -3
  echo "---"
done
# 기대: 각 파일 모두 resolveWikiPageInput 이 startSpinner 보다 위 라인

# 5. spinner try/catch 보호 (1-2 회피 검증)
for f in src/commands/wiki/page-file/{list,upload,download,download-all,delete}.ts; do
  if ! grep -q "stopSpinner(false)" "$f"; then
    echo "MISSING: $f"
  fi
done
# 기대: 출력 없음 (모든 파일에 stopSpinner(false) 호출 포함)
```

## 작업 외 금지

- README / SKILL.md 갱신 금지 — phase-03
- 본 task 외의 다른 wiki 명령 동작 변경 금지
- API client 메소드 추가 금지 — phase-01 의 3 메소드로 충분
- 신규 ADR 작성 금지 — ADR-029 는 task 생성 시점 commit
- inline_image upload 시 wiki 본문 markdown 자동 삽입 금지 — stdout snippet 안내까지만 (사용자 결정, 본문 자동 수정 X)
- list 의 `--json` raw 출력에서 files/images 별도 객체로 분리하지 말 것 — type 컬럼만 추가한 합쳐진 배열 (사용자가 jq 로 filter 가능)

## 커밋

```bash
# cwd: /Users/nhn/personal/dooray-cli
git add src/commands/wiki/page-file/ src/index.ts
git commit -m "$(cat <<'EOF'
feat(commands): add wiki page file 5 commands (list/upload/download/download-all/delete, Issue #70 phase 2/3)

- commands/wiki/page-file/ 신규 디렉터리 — post file 명령군 mirror
- list: getWikiPage 의 files[] + images[] 합성, type 컬럼 추가
- upload: --type general|inline_image (기본 general), multipart type→file 순서
  강제 (ADR-029), inline_image 일 때 stdout 에 본문 삽입용 snippet 안내
- download: 단일 파일 (-o 디렉터리 지정 가능)
- download-all: files + images 일괄 다운로드, 부분 실패 시 non-zero exit
- delete: confirm 없이 즉시 (post file delete mirror)
- src/index.ts: wikiPageCommand.addCommand(wikiPageFileCommand) 등록
EOF
)"
```
