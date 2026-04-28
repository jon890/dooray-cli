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

async function readBody(opts: {
  body?: string;
  bodyFile?: string;
}): Promise<string | undefined> {
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
    let title: string | undefined = opts.title;
    let userBody = await readBody(opts);
    let labels: string[] = [...(opts.label as string[])];

    if (!title) {
      title = await input({ message: "이슈 제목" });
    }
    if (!title || !title.trim()) {
      throw new DoorayCliError("제목이 필요합니다.", EXIT_PARAM_ERROR);
    }
    if (labels.length === 0 && !opts.title && !opts.body && !opts.bodyFile) {
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

    const version = await readCliVersion();
    const meta = collectMeta(version);
    const issueBody = buildIssueBody(userBody, meta);

    if (opts.dryRun) {
      process.stdout.write("--- DRY RUN ---\n");
      process.stdout.write(`Repo: ${TARGET_REPO}\n`);
      process.stdout.write(`Title: ${title}\n`);
      process.stdout.write(
        `Labels: ${labels.length > 0 ? labels.join(", ") : "(없음)"}\n`,
      );
      process.stdout.write("Body:\n");
      process.stdout.write(issueBody);
      process.stdout.write("--- END ---\n");
      return;
    }

    const isInteractive = !opts.title;
    if (isInteractive) {
      process.stderr.write("\n--- 미리보기 ---\n");
      process.stderr.write(`Repo: ${TARGET_REPO}\n`);
      process.stderr.write(`Title: ${title}\n`);
      process.stderr.write(
        `Labels: ${labels.length > 0 ? labels.join(", ") : "(없음)"}\n`,
      );
      process.stderr.write("Body:\n");
      process.stderr.write(issueBody);
      process.stderr.write("--- 끝 ---\n\n");
      const ok = await confirm({
        message: "이 내용으로 등록할까요?",
        default: true,
      });
      if (!ok) {
        process.stderr.write("취소되었습니다.\n");
        return;
      }
    }

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
