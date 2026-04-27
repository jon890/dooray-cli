# Phase 2: feedback 명령 구현

## 컨텍스트

Phase 1 헬퍼 위에 `dooray feedback` 명령 entry. `gh` CLI에 위임. ADR-022.

### 먼저 읽을 파일

- `docs/adr.md` ADR-022
- `src/commands/setup.ts` — `@inquirer/prompts` 사용 패턴
- `src/index.ts` — 명령 등록 위치
- `src/utils/feedback-meta.ts` (phase 1)
- `src/utils/errors.ts` `DoorayCliError`, `src/utils/exit-codes.ts` `EXIT_PARAM_ERROR`

## 작업 목록 (4개)

### 1) `src/commands/feedback.ts` — 신규

```ts
import { Command } from "commander";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, unlink, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { input, editor, confirm } from "@inquirer/prompts";
import {
  readCliVersion,
  collectMeta,
  buildIssueBody,
} from "../utils/feedback-meta.js";
import { DoorayCliError } from "../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../utils/exit-codes.js";

const execFileAsync = promisify(execFile);
const TARGET_REPO = "jon890/dooray-cli";

async function ensureGhInstalled(): Promise<void> {
  try {
    await execFileAsync("gh", ["--version"]);
  } catch {
    throw new DoorayCliError(
      "gh CLI가 설치되어 있지 않습니다.\n" +
        "  설치: brew install gh  (또는 https://cli.github.com)\n" +
        "  설치 후: gh auth login",
      EXIT_PARAM_ERROR,
    );
  }
}

async function readBody(opts: { body?: string; bodyFile?: string }): Promise<string | undefined> {
  if (opts.body) return opts.body;
  if (opts.bodyFile) return await readFile(opts.bodyFile, "utf-8");
  return undefined;
}

export const feedbackCommand = new Command("feedback")
  .description("dooray-cli에 대한 GitHub issue 등록 (gh CLI 위임)")
  .option("--title <text>", "이슈 제목 (없으면 인터랙티브)")
  .option("--body <text>", "이슈 본문")
  .option("--body-file <path>", "본문 파일 경로")
  .option(
    "--label <name>",
    "라벨 (반복 가능)",
    (value: string, prev: string[]) => [...prev, value],
    [] as string[],
  )
  .option("--dry-run", "gh 호출 없이 본문만 미리보기")
  .action(async (opts) => {
    // 1. 입력 수집 — non-interactive 우선, 모자라면 prompt
    let title = opts.title;
    let userBody = await readBody(opts);
    let labels: string[] = [...(opts.label as string[])];

    if (!title) {
      title = await input({ message: "이슈 제목" });
    }
    if (!title || !title.trim()) {
      throw new DoorayCliError("제목이 필요합니다.", EXIT_PARAM_ERROR);
    }
    if (labels.length === 0 && !opts.title && !opts.body && !opts.bodyFile) {
      // 완전 인터랙티브 흐름에서만 라벨 prompt
      const labelInput = await input({
        message: "라벨 (콤마로 여러 개, 비우면 없음)",
        default: "",
      });
      labels = labelInput
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    if (userBody == null) {
      userBody = await editor({
        message: "본문 작성 ($EDITOR가 열림)",
        default: "",
      });
    }
    if (!userBody.trim()) {
      throw new DoorayCliError("본문이 비어있습니다.", EXIT_PARAM_ERROR);
    }

    // 2. 메타 + 본문 조립
    const version = await readCliVersion();
    const meta = collectMeta(version);
    const issueBody = buildIssueBody(userBody, meta);

    // 3. dry-run 또는 confirm
    if (opts.dryRun) {
      process.stdout.write("--- DRY RUN ---\n");
      process.stdout.write(`Repo: ${TARGET_REPO}\n`);
      process.stdout.write(`Title: ${title}\n`);
      process.stdout.write(`Labels: ${labels.length > 0 ? labels.join(", ") : "(없음)"}\n`);
      process.stdout.write("Body:\n");
      process.stdout.write(issueBody);
      process.stdout.write("--- END ---\n");
      return;
    }

    // 인터랙티브 모드일 때 한 번 더 confirm (--title 같은 옵션 없이 들어왔을 때만)
    const isInteractive = !opts.title;
    if (isInteractive) {
      process.stderr.write("\n--- 미리보기 ---\n");
      process.stderr.write(`Repo: ${TARGET_REPO}\n`);
      process.stderr.write(`Title: ${title}\n`);
      process.stderr.write(`Labels: ${labels.length > 0 ? labels.join(", ") : "(없음)"}\n`);
      process.stderr.write("Body:\n");
      process.stderr.write(issueBody);
      process.stderr.write("--- 끝 ---\n\n");
      const ok = await confirm({ message: "이 내용으로 등록할까요?", default: true });
      if (!ok) {
        process.stderr.write("취소되었습니다.\n");
        return;
      }
    }

    // 4. gh CLI 위임
    await ensureGhInstalled();
    const bodyFile = join(tmpdir(), `dooray-feedback-${randomUUID()}.md`);
    await writeFile(bodyFile, issueBody);
    try {
      const args = [
        "issue",
        "create",
        "--repo",
        TARGET_REPO,
        "--title",
        title,
        "--body-file",
        bodyFile,
      ];
      for (const l of labels) {
        args.push("--label", l);
      }
      const { stdout } = await execFileAsync("gh", args);
      process.stdout.write(stdout);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new DoorayCliError(
        `GitHub issue 생성 실패:\n${msg}\n\n` +
          `gh 인증 안 되어 있으면: gh auth login`,
        EXIT_PARAM_ERROR,
      );
    } finally {
      await unlink(bodyFile).catch(() => {});
    }
  });
```

### 2) `src/index.ts` — 명령 등록

다른 명령(`projectCommand`, `postCommand` 등)과 동일 패턴으로 `feedbackCommand` 추가:
```ts
import { feedbackCommand } from "./commands/feedback.js";
// ...
program.addCommand(feedbackCommand);
```

### 3) (선택) 명령 단위 테스트 생략

명령 핸들러는 외부 호출(`execFile`, inquirer prompt) 비중이 높아 단위 테스트 비용 ↑ 대비 가치 ↓. 핵심 로직(`buildIssueBody`)은 phase 1에서 검증. 명령 동작은 phase 3 시나리오에서.

### 4) `--help` 텍스트 개선

`description`에 gh CLI 의존 명시. 사용자가 `--help` 보고 즉시 이해하도록.

위 코드의 `.description("dooray-cli에 대한 GitHub issue 등록 (gh CLI 위임)")` 그대로.

## 성공 기준

- [ ] `pnpm build` 성공
- [ ] `pnpm test` 통과
- [ ] `node dist/index.js --help` 출력에 `feedback` 노출
- [ ] `node dist/index.js feedback --help` 모든 옵션 노출 (`--title`, `--body`, `--body-file`, `--label`, `--dry-run`)
- [ ] `grep -c "TARGET_REPO\|jon890/dooray-cli" src/commands/feedback.ts` → 1 이상 (하드코딩 확인)
- [ ] `grep -c "baseUrl\|apiKey" src/commands/feedback.ts` → 0 (시크릿 미참조)

## 주의사항

- **`@inquirer/prompts`의 `editor`는 `$EDITOR` 환경변수 필요** — 미설정 시 inquirer가 기본 fallback 처리 (vim 등). README/help 텍스트에 별도 안내는 불필요
- **stderr/stdout 구분**: 미리보기·취소 메시지는 stderr, gh 응답(issue URL)은 stdout
- **`--title` 옵션 있는 비인터랙티브 모드는 confirm 건너뜀** (CI/스크립트 호환성)
- **`--dry-run`은 항상 stdout** (파이프 가능)
- **임시 파일 정리는 `finally` 보장** — gh 실패 케이스에서도 누수 없음
- **Sanitization 회귀 방지**: 본문 조립을 직접 하지 말 것 — 반드시 `buildIssueBody` 호출. 시크릿 누출 회귀를 phase 1 단위 테스트가 잡음

## Blocked 조건

- phase 1 산출물 부재 → `PHASE_BLOCKED: phase 1 미완료`
- `@inquirer/prompts`에 `editor`/`confirm` export 부재 (구버전) → `PHASE_BLOCKED: inquirer 버전 확인 필요`
