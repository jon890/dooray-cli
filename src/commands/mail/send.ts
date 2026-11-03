import { Command } from "commander";
import { getConfigOrThrow } from "../../config/store.js";
import { sendMail } from "../../api/smtpClient.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import type { OutputOptions } from "../../formatters/table.js";
import { printJson } from "../../formatters/table.js";
import { readBodyInput } from "../../utils/body-input.js";
import { DoorayCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
import { resolveMailAttachments } from "../../utils/mail-attach.js";
import { saveSentCopy } from "./save-sent.js";

export const mailSendCommand = new Command("send")
  .description("메일 발송")
  .requiredOption("--to <addresses...>", "받는사람 이메일 (복수 가능)")
  .requiredOption("--subject <title>", "제목")
  .option("--body <text>", "본문 (- 입력 시 stdin)")
  .option("--body-file <path>", "본문 파일 경로 (- 입력 시 stdin)")
  .option("--cc <addresses...>", "참조")
  .option("--bcc <addresses...>", "숨은참조")
  .option("--html", "본문을 HTML로 전송")
  .option("--attach <paths...>", "첨부 파일 경로 (복수 가능)")
  .option("--no-save-sent", "보낸메일함에 저장하지 않음")
  .action(async (opts) => {
    const globalOpts = mailSendCommand.optsWithGlobals() as OutputOptions;
    const config = await getConfigOrThrow();

    const body = await readBodyInput(opts);
    if (!body) {
      throw new DoorayCliError("--body 또는 --body-file을 지정하세요", EXIT_PARAM_ERROR);
    }

    const attachments = await resolveMailAttachments(opts.attach);

    startSpinner("메일 발송 중...");
    const { raw, ...result } = await sendMail(config, {
      to: opts.to,
      cc: opts.cc,
      bcc: opts.bcc,
      subject: opts.subject,
      body,
      html: opts.html,
      attachments,
    });
    stopSpinner(true, "메일 발송 완료");
    const saved = await saveSentCopy(config, raw, opts.saveSent);

    if (globalOpts.json) {
      printJson({ ...result, attachments: attachments.map((a) => a.filename), ...saved });
    } else {
      process.stdout.write(
        `메일 발송 완료\n` +
          `  Message-ID: ${result.messageId}\n` +
          `  수신: ${result.accepted.join(", ")}\n` +
          (result.rejected.length
            ? `  거부: ${result.rejected.join(", ")}\n`
            : "") +
          (attachments.length
            ? `  첨부: ${attachments.map((a) => a.filename).join(", ")}\n`
            : ""),
      );
    }
  });
