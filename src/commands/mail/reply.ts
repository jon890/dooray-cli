import { Command } from "commander";
import { readFile } from "node:fs/promises";
import { getConfigOrThrow } from "../../config/store.js";
import { getMail } from "../../api/imapClient.js";
import { sendMail } from "../../api/smtpClient.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import type { OutputOptions } from "../../formatters/table.js";
import { printJson } from "../../formatters/table.js";
import { simpleParser } from "mailparser";
import { ImapFlow } from "imapflow";
import { getImapConfigOrThrow } from "../../api/imapClient.js";

async function getMessageId(config: Parameters<typeof getImapConfigOrThrow>[0], uid: number): Promise<string | null> {
  const imap = getImapConfigOrThrow(config);
  const client = new ImapFlow({
    host: imap.host,
    port: imap.port,
    secure: true,
    auth: { user: imap.username, pass: imap.password },
    logger: false,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const msg = await client.fetchOne(String(uid), {
        uid: true,
        envelope: true,
      }, { uid: true });
      if (!msg) return null;
      return msg.envelope?.messageId ?? null;
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }
}

export const mailReplyCommand = new Command("reply")
  .description("메일 답장")
  .argument("<uid>", "원본 메일 UID")
  .option("--body <text>", "답장 본문")
  .option("--body-file <path>", "답장 본문 파일 경로")
  .option("--cc <addresses...>", "참조")
  .option("--html", "본문을 HTML로 전송")
  .action(async (uid, opts) => {
    const globalOpts = mailReplyCommand.optsWithGlobals() as OutputOptions;
    const config = await getConfigOrThrow();

    let body = opts.body ?? "";
    if (opts.bodyFile) {
      body = await readFile(opts.bodyFile, "utf-8");
    }
    if (!body) {
      process.stderr.write("오류: --body 또는 --body-file을 지정하세요\n");
      process.exit(3);
    }

    startSpinner("원본 메일 조회 중...");
    const original = await getMail(config, Number(uid));
    const messageId = await getMessageId(config, Number(uid));

    // Extract sender email for reply-to
    const fromMatch = original.from.match(/<(.+?)>/);
    const replyTo = fromMatch ? fromMatch[1] : original.from;

    stopSpinner(true, "원본 메일 조회 완료");

    startSpinner("답장 발송 중...");
    const result = await sendMail(config, {
      to: [replyTo],
      cc: opts.cc,
      subject: original.subject.startsWith("Re: ")
        ? original.subject
        : `Re: ${original.subject}`,
      body,
      html: opts.html,
      inReplyTo: messageId ?? undefined,
      references: messageId ?? undefined,
    });
    stopSpinner(true, "답장 발송 완료");

    if (globalOpts.json) {
      printJson(result);
    } else {
      process.stdout.write(
        `답장 발송 완료\n` +
          `  To: ${replyTo}\n` +
          `  Message-ID: ${result.messageId}\n`,
      );
    }
  });
