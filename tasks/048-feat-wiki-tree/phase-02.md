# Phase 02 — formatWikiTree 포맷터 + wiki tree 커맨드 + index.ts 등록

**Model**: sonnet
**Status**: pending

---

## 목표

phase-01 의 `getAllWikiPages` 가 반환하는 flat `WikiPage[]` 를 사용자에게 트리로 보여준다.
`dooray wiki tree <project>` 신규 서브커맨드를 만들고 `wiki pages` 의 형제로 등록한다.

**범위 외**: 타입·client 는 phase-01 완료 전제. 테스트는 phase-03. README/SKILL 은 phase-04.

---

## 작업 항목 (3)

### 1. `src/formatters/wiki.ts` — `formatWikiTree` 추가

기존 `formatWikiPages` 아래에 추가한다. 3 출력 모드:

```ts
export function formatWikiTree(pages: WikiPage[], opts: OutputOptions): void
```

- `opts.json` → `printJson(pages)` — flat 배열 그대로 (`parentPageId` 포함, 기존 `wiki pages --json` 스키마 유지).
- `opts.quiet` → `printQuiet(pages.map((p) => p.id))` — id 목록만.
- 그 외(text) → 아래 트리 렌더.

`printJson` / `printQuiet` 은 `./table.js` 에서 이미 export (재사용, 새로 만들지 않음).
현재 `wiki.ts` 상단 import 는 `{ output, printJson }` 뿐 — `printQuiet` 를 import 목록에 추가한다.

**순수 함수로 분리 (테스트 가능성 — phase-03 이 I/O 없이 검증)**:

I/O 와 조립/렌더 로직을 분리한다 (pitfall: io-and-throw-coupled-untestable). 같은 파일 안에 export:

1. `buildWikiTree(pages: WikiPage[]): WikiTreeNode[]` — flat → 중첩 트리 (순수).
   - `WikiTreeNode = { page: WikiPage; children: WikiTreeNode[] }` 타입 정의.
   - 루트 후보: `root === true` 이거나 `parentPageId` 가 배열 내 어떤 id 에도 매칭 안 되는 페이지.
   - 자식 그룹: `parentPageId` → 자식 배열 map 으로 조립.
   - Map 조회 시 `Map.get()!` non-null 단언 금지 — `?? []` 로 처리.
2. `renderWikiTree(nodes: WikiTreeNode[]): string` — 트리 → 문자열 (순수, 개행 포함).
   - `├─` / `└─` / `│  ` / `   ` 커넥터로 들여쓰기. 마지막 형제는 `└─`, 그 외 `├─`.
   - 각 노드 라인: `<커넥터><subject> (<id>)`. 사용자가 후속 명령에 쓸 id 를 볼 수 있게 한다.
   - `subject` 는 사용자 데이터 — 개행 제거해 한 줄로 정규화 (`truncate` 또는 `replace(/[\r\n]+/g, " ")`).
   - 루트가 여러 개면 각각 최상단으로.

`formatWikiTree` 는 위 두 순수 함수를 조합 + I/O 만 담당:

```ts
export function formatWikiTree(pages: WikiPage[], opts: OutputOptions): void {
  if (opts.json) { printJson(pages); return; }
  if (opts.quiet) { printQuiet(pages.map((p) => p.id)); return; }
  process.stdout.write(renderWikiTree(buildWikiTree(pages)) + "\n");
}
```

### 2. `src/commands/wiki/tree.ts` — 신규 커맨드

`src/commands/wiki/pages.ts` 를 패턴 참조해 작성:

```ts
export const wikiTreeCommand = new Command("tree")
  .description("위키 페이지 계층 트리 조회")
  .argument("<project>", "프로젝트 코드 또는 ID")
  .option("--depth <n>", "재귀 최대 깊이 (root=1, 미지정 시 전체)")
  .action(async (project, opts) => {
    const globalOpts = wikiTreeCommand.optsWithGlobals() as OutputOptions;
    const config = await getConfigOrThrow();
    const client = new DoorayApiClient(config.apiKey, config.baseUrl);

    // depth 파싱 + 검증 (spinner 시작 전 — pitfall: spinner-before-validation)
    let maxDepth: number | undefined;
    if (opts.depth !== undefined) {
      const parsed = Number(opts.depth);
      if (!Number.isInteger(parsed) || parsed < 1) {
        throw new DoorayCliError("--depth 는 1 이상의 정수여야 합니다", EXIT_PARAM_ERROR);
      }
      maxDepth = parsed;
    }

    startSpinner("위키 페이지 트리 조회 중...");
    const wikiId = await resolveWiki(client, project);
    const pages = await client.getAllWikiPages(wikiId, maxDepth);
    stopSpinner(true, "위키 페이지 트리 조회 완료");

    formatWikiTree(pages, globalOpts);
  });
```

- import: `getConfigOrThrow`, `DoorayApiClient`, `resolveWiki`, `formatWikiTree`, `startSpinner`/`stopSpinner`, `OutputOptions`, `DoorayCliError` + exit code — 기존 커맨드가 쓰는 경로와 동일하게.
- **검증은 spinner 시작 전에** — `--depth` 파싱/검증을 `startSpinner` 앞에 둔다.
- exit code 상수는 `src/utils/exit-codes.ts` 에서 잘못된 입력에 맞는 것을 사용 (기존 커맨드가 인자 검증 실패에 쓰는 값 확인).

### 3. `src/index.ts` — 커맨드 등록

- import 추가 (33행 `wikiPagesCommand` import 부근):
  ```ts
  import { wikiTreeCommand } from "./commands/wiki/tree.js";
  ```
- 등록 (116행 `wikiCommand.addCommand(wikiPagesCommand);` 다음 줄):
  ```ts
  wikiCommand.addCommand(wikiTreeCommand);
  ```

---

## 회피 항목 (code-review pitfalls self-check)

- `docs/pitfalls/code-review/spinner-before-validation.md` — `--depth` 검증을 spinner 시작 전에. 위 코드가 그 순서.
- `docs/pitfalls/code-review/spinner-missing-try-catch.md` — 기존 wiki 커맨드가 try/catch 를 쓰지 않고 index.ts 최상위에서 처리하면 동일 패턴 유지. `pages.ts` 를 그대로 참조.
- `docs/pitfalls/code-review/early-return-output-mode-branch-missing.md` + `quiet-mode-missing-identifier.md` — json/quiet/text 3 분기 모두 구현. quiet 는 id 출력.
- `docs/pitfalls/code-review/empty-result-to-stderr.md` — 빈 위키(페이지 0개)는 데이터로 stdout 처리 (에러 아님). json→`[]`, quiet→빈 출력, text→아무 것도 안 나오거나 최소 출력. stderr 로 보내지 않는다.
- `docs/pitfalls/code-review/map-get-non-null-assertion.md` — 자식 map 조회에 `!` 금지.
- `docs/pitfalls/code-review/unsanitized-external-string-output.md` — `subject`(사용자 데이터) 출력 시 개행 정규화 고려.

---

## Critical Files

| 파일 | 변경 |
|---|---|
| `src/formatters/wiki.ts` | 수정 — `formatWikiTree` 추가 |
| `src/commands/wiki/tree.ts` | 신규 — `wikiTreeCommand` |
| `src/index.ts` | 수정 — import + `wikiCommand.addCommand(wikiTreeCommand)` |

## 검증

```bash
# cwd: /Users/nhn/personal/dooray-cli/.claude/worktrees/plan048
pnpm tsc --noEmit
# 0 에러

pnpm run build
node dist/index.js wiki tree --help
# "위키 페이지 계층 트리 조회" + --depth 옵션 노출 확인

grep -n "wikiTreeCommand" src/index.ts
# import + addCommand 2곳 확인
```

## 의도 메모 (왜)

- `wiki tree` 를 `wiki pages` 형제로 둔 이유는 ADR-034 — `pages` 는 단일 레벨 조회가 본래 역할이라 전체 재귀는 별 명령으로 분리해 의미를 명확히 함.
- `--json` flat 유지는 기존 `wiki pages --json` 자동화 파싱 호환을 위해서다 (children 중첩 트리로 바꾸면 스키마가 어긋남).
- 트리 렌더에 id 를 노출하는 이유: 사용자가 트리에서 페이지를 찾은 뒤 `wiki get`/`wiki page delete` 등 후속 명령에 곧바로 쓰기 위해서다.
