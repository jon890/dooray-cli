import { Command } from "commander";
import { getConfigOrThrow } from "../../config/store.js";
import { sendMail } from "../../api/smtpClient.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import type { OutputOptions } from "../../formatters/table.js";
import { printJson } from "../../formatters/table.js";
import { readBodyInput } from "../../utils/body-input.js";
import { DoorayCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";

export const mailSendCommand = new Command("send")
  .description("메일 발송")
  .requiredOption("--to <addresses...>", "받는사람 이메일 (복수 가능)")
  .requiredOption("--subject <title>", "제목")
  .option("--body <text>", "본문 (- 입력 시 stdin)")
  .option("--body-file <path>", "본문 파일 경로 (- 입력 시 stdin)")
  .option("--cc <addresses...>", "참조")
  .option("--bcc <addresses...>", "숨은참조")
  .option("--html", "본문을 HTML로 전송")
  .action(async (opts) => {
    const globalOpts = mailSendCommand.optsWithGlobals() as OutputOptions;
    const config = await getConfigOrThrow();

    const body = await readBodyInput(opts);
    if (!body) {
      throw new DoorayCliError("--body 또는 --body-file을 지정하세요", EXIT_PARAM_ERROR);
    }

    startSpinner("메일 발송 중...");
    const result = await sendMail(config, {
      to: opts.to,
      cc: opts.cc,
      bcc: opts.bcc,
      subject: opts.subject,
      body,
      html: opts.html,
    });
    stopSpinner(true, "메일 발송 완료");

    if (globalOpts.json) {
      printJson(result);
    } else {
      process.stdout.write(
        `메일 발송 완료\n` +
          `  Message-ID: ${result.messageId}\n` +
          `  수신: ${result.accepted.join(", ")}\n` +
          (result.rejected.length
            ? `  거부: ${result.rejected.join(", ")}\n`
            : ""),
      );
    }
  });
