import { Command } from "commander";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { getConfigOrThrow } from "../../config/store.js";
import { getMailAttachments } from "../../api/imapClient.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import type { OutputOptions } from "../../formatters/table.js";
import { printJson } from "../../formatters/table.js";
import { emitDownloadAllResult } from "../../formatters/file-output.js";
import { resolveMailTarget, resolveMailUid } from "../../resolvers/mail-input.js";
import { sanitizeForTerminal } from "../../utils/sanitize.js";
import { DoorayCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";

function collectId(value: string, previous: string[]): string[] {
  return [...previous, value];
}

export const mailAttachmentCommand = new Command("attachment")
  .description("메일 첨부 파일 저장")
  .argument("<target>", "메일 UID / 메일 웹 주소 / 웹 주소의 mail id")
  .option(
    "--id <index>",
    "저장할 첨부 순번 (mail get 이 보여 준 값, 여러 번 줄 수 있다. 없으면 모두 저장)",
    collectId,
    [] as string[],
  )
  .option("-o, --output <dir>", "저장 디렉토리", ".")
  .option("--force", "같은 이름의 파일을 덮어쓴다")
  .action(async (target, opts) => {
    const globalOpts = mailAttachmentCommand.optsWithGlobals() as OutputOptions;
    const mailTarget = resolveMailTarget(target);

    const requested = [...new Set((opts.id as string[]).map((raw) => {
      if (!/^\d+$/.test(raw) || Number(raw) < 1 || !Number.isSafeInteger(Number(raw))) {
        throw new DoorayCliError(
          `--id 는 1 이상의 정수여야 합니다: "${raw}"`,
          EXIT_PARAM_ERROR,
        );
      }
      return Number(raw);
    }))].sort((a, b) => a - b);

    const config = await getConfigOrThrow();
    const plain = !globalOpts.json && !globalOpts.quiet;

    const spinner = startSpinner(
      mailTarget.kind === "mailId" ? "메일 찾는 중..." : "메일 조회 중...",
    );
    try {
      const { uid, mailbox } = await resolveMailUid(config, target);
      if (mailTarget.kind === "mailId") {
        spinner.text = "메일 조회 중...";
      }
      const { subject, attachments } = await getMailAttachments(config, uid, mailbox);
      stopSpinner(true, "메일 조회 완료");

      process.stderr.write(`대상 메일: UID ${uid} "${sanitizeForTerminal(subject)}"\n`);

      if (attachments.length === 0 && requested.length === 0) {
        if (globalOpts.json) {
          printJson({ count: 0, succeeded: [], failed: [] });
        } else if (!globalOpts.quiet) {
          process.stdout.write("첨부파일이 없습니다.\n");
        }
        return;
      }

      const missing = requested.filter((n) => !attachments.some((a) => a.index === n));
      if (missing.length > 0) {
        const range = attachments.length > 0 ? `1-${attachments.length}` : "첨부 없음";
        throw new DoorayCliError(
          `메일에 없는 첨부 순번입니다: ${missing.join(", ")} (유효한 범위: ${range})`,
          EXIT_PARAM_ERROR,
        );
      }

      const targets = requested.length > 0
        ? attachments.filter((a) => requested.includes(a.index))
        : attachments;
      await mkdir(opts.output, { recursive: true });

      const succeeded: { path: string; fileName: string }[] = [];
      const failed: { fileId: string; error: string }[] = [];

      for (const att of targets) {
        // fileName 은 assignAttachmentFileNames 가 sanitizeFileName 으로 basename 만 남긴 값이라 경로를 벗어나지 않는다.
        const outputPath = join(opts.output, att.fileName);
        try {
          await writeFile(outputPath, att.content, { flag: opts.force ? "w" : "wx" });
          succeeded.push({ path: outputPath, fileName: att.fileName });
          if (plain) {
            process.stdout.write(`✓ ${sanitizeForTerminal(att.fileName)}\n`);
          }
        } catch (e) {
          const error = (e as NodeJS.ErrnoException).code === "EEXIST"
            ? `이미 있습니다 (덮어쓰려면 --force): ${sanitizeForTerminal(outputPath)}`
            : sanitizeForTerminal(e instanceof Error ? e.message : String(e));
          failed.push({ fileId: String(att.index), error });
          if (!globalOpts.json) {
            process.stderr.write(
              `✗ ${sanitizeForTerminal(att.fileName)} (${att.index}): ${error}\n`,
            );
          }
        }
      }

      emitDownloadAllResult(globalOpts, { count: targets.length, succeeded, failed });
      if (failed.length > 0) process.exitCode = 1;
    } catch (error) {
      stopSpinner(false);
      throw error;
    }
  });
