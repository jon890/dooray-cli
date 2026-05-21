# Phase 02 — commands/wiki/page-comment/ 6 명령 (list/latest/get/add/edit/delete) + index.ts 등록

## 컨텍스트

Phase-01 에서 인프라 (`WikiComment` 타입 + 5 API 메소드 + `formatters/wiki-comment.ts`) 가 준비됐다.
본 phase 는 6 명령 파일 작성 + `src/index.ts` 의 `wikiPageCommand` 그룹 아래 `comment` 서브그룹 등록.

**post comment 6 명령 (list/latest/get/add/edit/delete) 이 mirror 기준** — 단 wiki 시그니처 축소 적용:
- ❌ `--mention` / `--mention-group` — wiki API 미지원
- ❌ `--link-task` — comment 본문 합성 가능하나 mirror 명료성 위해 본 task scope 외 (별도 follow-up)
- ❌ `--dry-run` — 본 task 단순화. 필요 시 별도 follow-up
- ✅ `--body` / `--body-file` / `$EDITOR` fallback
- ✅ `--id <pageId>` + `--url <url>` + positional URL + `<project> <page-id>` 입력 분기 (`resolveWikiPageInput` 재사용 — task 035 산출물)

코드 컨텍스트:
- `src/commands/post/comment/{list,latest,get,add,edit,delete}.ts` — 패턴 기준
- `src/resolvers/wiki-page-input.ts` (task 035) — `resolveWikiPageInput`
- `src/utils/body-input.ts` — `readBodyInput` / `readBodyInputOrNull` (`--body` / `--body-file` / stdin)
- `src/editor/index.ts` — `openInEditor`
- `src/formatters/wiki-comment.ts` (phase-01) — `formatWikiCommentDetail` / `formatWikiCommentList`
- `src/index.ts:115-119` — `wikiPageCommand` 그룹 (comment 서브그룹 등록 지점)

## 변경 파일 (정확)

기대 결과 (총 9 파일):
```
src/commands/wiki/page-comment/list.ts        (신규)
src/commands/wiki/page-comment/latest.ts      (신규 — = list --latest 1 shortcut)
src/commands/wiki/page-comment/get.ts         (신규)
src/commands/wiki/page-comment/add.ts         (신규 — $EDITOR fallback)
src/commands/wiki/page-comment/edit.ts        (신규 — $EDITOR fallback)
src/commands/wiki/page-comment/delete.ts      (신규 — confirm 없이 즉시)
src/commands/wiki/page-comment/index.ts       (신규 — 6 명령 조립 후 wikiPageCommentCommand export)
src/commands/wiki/page-comment/get.test.ts    (신규 — comment-id positional 분기 1-2 케이스)
src/index.ts                                  (수정 — wikiPageCommand.addCommand(wikiPageCommentCommand) 한 줄 + import)
```

**planning docs 는 task 생성 시점에 main 직접 commit 으로 선반영** — phase 안에서 추가 변경 금지.

## 작업 항목 (5개 이하)

### 1. `list.ts` + `latest.ts`

#### `list.ts`

```ts
import { Command } from "commander";
import { getConfigOrThrow } from "../../../config/store.js";
import { DoorayApiClient } from "../../../api/client.js";
import { resolveWikiPageInput } from "../../../resolvers/wiki-page-input.js";
import { formatWikiCommentList } from "../../../formatters/wiki-comment.js";
import { type OutputOptions } from "../../../formatters/table.js";
import { startSpinner, stopSpinner } from "../../../utils/spinner.js";

export const wikiPageCommentListCommand = new Command("list")
  .description("위키 페이지 댓글 목록 조회 (최신순)")
  .argument("[project]", "프로젝트 코드 (또는 첫 인자에 Dooray Wiki URL)")
  .argument("[page-id]", "위키 페이지 ID")
  .option("--id <pageId>", "위키 페이지 ID (--project 동반)")
  .option("--url <url>", "Dooray Wiki URL")
  .option("--project <code>", "프로젝트 코드 (--id 모드용)")
  .option("--size <n>", "페이지 크기 (기본 20, 최대 100)", (v) => parseInt(v, 10))
  .option("--page <n>", "페이지 번호 (0부터)", (v) => parseInt(v, 10))
  .option("--latest <n>", "최신 N개만 (size 대신 사용)", (v) => parseInt(v, 10))
  .action(async (project, pageIdArg, opts) => {
    const globalOpts = wikiPageCommentListCommand.optsWithGlobals() as OutputOptions;
    const config = await getConfigOrThrow();
    const client = new DoorayApiClient(config.apiKey, config.baseUrl);

    const { wikiId, pageId } = await resolveWikiPageInput(client, {
      projectArg: project, pageIdArg, idOpt: opts.id, urlOpt: opts.url, project: opts.project,
    });

    const size = opts.latest ?? opts.size ?? 20;
    const page = opts.page ?? 0;

    startSpinner("댓글 목록 조회 중...");
    try {
      const res = await client.getWikiPageComments(wikiId, pageId, { size, page });
      stopSpinner(true, `댓글 ${res.result.length}건 (총 ${res.totalCount})`);
      formatWikiCommentList(res.result, { globalOpts, totalCount: res.totalCount });
    } catch (e) {
      stopSpinner(false);
      throw e;
    }
  });
```

#### `latest.ts` — shortcut

```ts
// = list --latest 1 — formatter 는 detail 사용 (단일이라 더 풍부한 출력)
export const wikiPageCommentLatestCommand = new Command("latest")
  .description("최신 댓글 1건 조회 (= comment list --latest 1)")
  // ... 동일 옵션 (size/page/latest 만 제거) ...
  .action(async (project, pageIdArg, opts) => {
    const { wikiId, pageId } = await resolveWikiPageInput(client, { ... });
    startSpinner("최신 댓글 조회 중...");
    try {
      const res = await client.getWikiPageComments(wikiId, pageId, { size: 1, page: 0 });
      stopSpinner(true, res.result.length > 0 ? "최신 댓글" : "댓글 없음");
      if (res.result.length === 0) return;
      formatWikiCommentDetail(res.result[0], globalOpts);
    } catch (e) {
      stopSpinner(false);
      throw e;
    }
  });
```

### 2. `get.ts` + 단위 테스트

post `comment/get.ts` 의 3-positional 분기 (`<project> <page-id> <comment-id>`) mirror. 단 wiki 입력 분기는 `resolveWikiPageInput` + `<comment-id>` 추가:

```ts
// 분기 패턴:
//   wiki page comment get <project> <page-id> <comment-id>          (3 positional)
//   wiki page comment get --id <pageId> --project <code> --comment-id <cid>
//   wiki page comment get --url <wiki-url> --comment-id <cid>
//   wiki page comment get <wiki-url> --comment-id <cid>             (1 positional URL)
.argument("[arg1]", "프로젝트 코드 / Dooray Wiki URL / (`--id`/`--url` 모드일 때) 댓글 ID")
.argument("[arg2]", "page-id 또는 (`--id`/`--url` 모드일 때) 댓글 ID")
.argument("[arg3]", "comment-id (3 positional 모드)")
.option("--id <pageId>", ...)
.option("--url <url>", ...)
.option("--project <code>", ...)
.option("--comment-id <id>", "댓글 ID (positional 대체)")
```

단위 테스트 (`get.test.ts`):
- positional 3개 → project, pageId, commentId 정상 분기
- `--url` + `--comment-id` → URL 에서 wiki/page 추출 + commentId 사용

(post comment 의 get.test.ts 참조 — 동일 패턴)

### 3. `add.ts` — $EDITOR fallback + body 옵션

```ts
import { openInEditor } from "../../../editor/index.js";
import { readBodyInputOrNull } from "../../../utils/body-input.js";

export const wikiPageCommentAddCommand = new Command("add")
  .description("위키 페이지 댓글 추가 (--body 없으면 $EDITOR)")
  .argument("[project]", "...")
  .argument("[page-id]", "...")
  .option("--id <pageId>", ...)
  .option("--url <url>", ...)
  .option("--project <code>", ...)
  .option("--body <text>", "댓글 본문 (- 입력 시 stdin)")
  .option("--body-file <path>", "본문 파일 경로 (- 입력 시 stdin)")
  .action(async (project, pageIdArg, opts) => {
    let bodyContent = await readBodyInputOrNull(opts);
    if (bodyContent == null) {
      bodyContent = await openInEditor("");
      if (!bodyContent.trim()) {
        process.stdout.write("빈 댓글은 작성할 수 없습니다.\n");
        return;
      }
    }

    const { wikiId, pageId } = await resolveWikiPageInput(client, { ... });

    startSpinner("댓글 추가 중...");
    try {
      const res = await client.addWikiPageComment(wikiId, pageId, { body: { content: bodyContent } });
      stopSpinner(true, `댓글 추가 완료 (id: ${res.result.id})`);
      if (globalOpts.json) printJson({ id: res.result.id });
      else if (globalOpts.quiet) printQuiet([res.result.id]);
      else process.stdout.write(`댓글 ID: ${res.result.id}\n`);
    } catch (e) {
      stopSpinner(false);
      throw e;
    }
  });
```

**post comment add 대비 단순화** (의도된 축소):
- ❌ `--mention` / `--mention-group` / `--link-task` / `--dry-run` 옵션 미지원
- 본문 합성 로직 (prependMentions / appendTaskLinks) 제거

### 4. `edit.ts` + `delete.ts`

#### `edit.ts`

```ts
// add 와 유사하되 commentId 분기 필요 (get.ts 패턴 mirror — 3 positional)
// $EDITOR fallback 진입 시 기존 댓글 본문 prefill:
const existing = await client.getWikiPageComment(wikiId, pageId, commentId);
let newBody = await readBodyInputOrNull(opts);
if (newBody == null) {
  newBody = await openInEditor(existing.result.body.content);
  if (!newBody.trim() || newBody === existing.result.body.content) {
    process.stdout.write("변경 사항이 없습니다.\n");
    return;
  }
}
await client.updateWikiPageComment(wikiId, pageId, commentId, { body: { content: newBody } });
```

#### `delete.ts` — confirm 없이 즉시

```ts
// 3 positional 분기 (post comment delete mirror)
const { wikiId, pageId } = await resolveWikiPageInput(client, { ... });
startSpinner("댓글 삭제 중...");
try {
  await client.deleteWikiPageComment(wikiId, pageId, commentId);
  stopSpinner(true, "삭제 완료");
  process.stdout.write(`댓글(${commentId})이 삭제되었습니다.\n`);
} catch (e) {
  stopSpinner(false);
  throw e;
}
```

### 5. `index.ts` (서브그룹 조립) + `src/index.ts` 등록

`src/commands/wiki/page-comment/index.ts`:

```ts
import { Command } from "commander";
import { wikiPageCommentListCommand } from "./list.js";
import { wikiPageCommentLatestCommand } from "./latest.js";
import { wikiPageCommentGetCommand } from "./get.js";
import { wikiPageCommentAddCommand } from "./add.js";
import { wikiPageCommentEditCommand } from "./edit.js";
import { wikiPageCommentDeleteCommand } from "./delete.js";

export const wikiPageCommentCommand = new Command("comment")
  .description("위키 페이지 댓글 관련 명령");

wikiPageCommentCommand.addCommand(wikiPageCommentListCommand);
wikiPageCommentCommand.addCommand(wikiPageCommentLatestCommand);
wikiPageCommentCommand.addCommand(wikiPageCommentGetCommand);
wikiPageCommentCommand.addCommand(wikiPageCommentAddCommand);
wikiPageCommentCommand.addCommand(wikiPageCommentEditCommand);
wikiPageCommentCommand.addCommand(wikiPageCommentDeleteCommand);
```

`src/index.ts:119` 근처 — `wikiCommand.addCommand(wikiPageCommand)` 직전에 추가:

```ts
import { wikiPageCommentCommand } from "./commands/wiki/page-comment/index.js";

// ... 기존 wikiPageCommand 조립 후 (file 그룹 등록 라인 옆):
wikiPageCommand.addCommand(wikiPageCommentCommand);
```

## code-review-pitfalls 회피 항목

- **1-1 (validation 전 spinner)**: 모든 명령에서 `resolveWikiPageInput` 호출을 `startSpinner` 보다 앞. param 검증 throw 시 spinner leak 회피
- **1-2 (spinner try/catch 보호)**: 모든 spinner 블록을 try/catch + `stopSpinner(false)` re-throw
- **3-3 (테스트 mock)**: `get.test.ts` 는 `resolveWikiPageInput` mock + commander positional 파싱만 검증. 실제 API 호출은 phase-03 동작 실증으로 대체
- **post 패턴 답습 위험 (수정 시 빈 본문 / 미변경 가드)**: `edit.ts` 의 $EDITOR fallback 에서 빈 본문 / 기존과 동일 시 abort. post comment edit 와 동일 가드
- **외과적 변경**: `src/index.ts` 는 import 1줄 + addCommand 1줄만. 기존 명령 동작 무변경

## 성공 기준

```bash
# cwd: /Users/nhn/personal/dooray-cli

# 1. tsc + build + test
pnpm tsc --noEmit 2>&1 | grep -cE "^src/"
pnpm build && pnpm test
# 둘 다 exit 0

# 2. 6 명령 등록
node dist/index.js wiki page comment --help 2>&1 | grep -cE "^  (list|latest|get|add|edit|delete)"
# 기대: 6

# 3. spinner ↔ resolveWikiPageInput 순서 (1-1 회피)
for f in src/commands/wiki/page-comment/{list,latest,get,add,edit,delete}.ts; do
  awk '/\.action\(async/,/^  \}\)\;/' "$f" | \
    grep -nE "(startSpinner|resolveWikiPageInput)" | head -3
  echo "---"
done
# 기대: 각 파일 resolveWikiPageInput 이 startSpinner 보다 위 라인

# 4. spinner try/catch 보호 (1-2 회피)
for f in src/commands/wiki/page-comment/{list,latest,get,add,edit,delete}.ts; do
  grep -q "stopSpinner(false)" "$f" || echo "MISSING: $f"
done
# 기대: 출력 없음

# 5. wiki API 호출에 mimeType 누락 (post 패턴 답습 사고 회피)
grep -nE "mimeType.*text/x-markdown" src/commands/wiki/page-comment/
# 기대: 0건
```

## 작업 외 금지

- README / SKILL.md 갱신 금지 — phase-03
- mention / cc / link-task / dry-run 옵션 mirror 금지 — wiki API 미지원 또는 의도된 축소
- 본문에 mimeType 전송 금지 — wiki API 는 content 만 받음
- 기존 post comment 명령 변경 금지
- 신규 API client 메소드 추가 금지 — phase-01 의 5 메소드로 충분
- 신규 ADR 작성 금지

## 커밋

```bash
# cwd: /Users/nhn/personal/dooray-cli
git add src/commands/wiki/page-comment/ src/index.ts
git commit -m "$(cat <<'EOF'
feat(commands): add wiki page comment 6 commands (list/latest/get/add/edit/delete, task 036 phase 2/3)

- commands/wiki/page-comment/ 신규 디렉터리 — post comment 패턴 mirror
- list: size/page/--latest 옵션 (최신순, 기본 size 20)
- latest: list --latest 1 shortcut, detail formatter
- get: <project> <page-id> <comment-id> 3-positional + --url/--id 분기
- add: --body / --body-file / $EDITOR fallback, content 만 전송 (mimeType 미전송)
- edit: 기존 본문 prefill + 빈/미변경 가드
- delete: confirm 없이 즉시
- src/index.ts: wikiPageCommand.addCommand(wikiPageCommentCommand) 등록

post comment 대비 축소 (wiki API 미지원 또는 본 task scope 외):
- mention / mention-group / link-task / dry-run 미지원
- 첨부 파일 / cc / 받는 사람 미지원
EOF
)"
```
