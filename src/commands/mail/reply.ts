import { Command } from "commander";
import { readFile } from "node:fs/promises";
import { getConfigOrThrow } from "../../config/store.js";
import { getMail } from "../../api/imapClient.js";
import { sendMail } from "../../api/smtpClient.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import type { OutputOptions } from "../../formatters/table.js";
import { printJson } from "../../formatters/table.js";
import { resolveMailTarget, resolveMailUid } from "../../resolvers/mail-input.js";
import {
  closeImapClient,
  connectImapClient,
  createImapClient,
  getImapConfigOrThrow,
} from "../../api/imapClient.js";

async function getMessageId(
  config: Parameters<typeof getImapConfigOrThrow>[0],
  uid: number,
  mailbox: string,
): Promise<string | null> {
  const client = createImapClient(config);

  try {
    await connectImapClient(client, config);
    const lock = await client.getMailboxLock(mailbox);
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
    await closeImapClient(client);
  }
}

export const mailReplyCommand = new Command("reply")
  .description("메일 답장")
  .argument("<target>", "메일 UID / 메일 웹 주소 / 웹 주소의 mail id")
  .option("--body <text>", "답장 본문")
  .option("--body-file <path>", "답장 본문 파일 경로")
  .option("--cc <addresses...>", "참조")
  .option("--html", "본문을 HTML로 전송")
  .action(async (target, opts) => {
    const globalOpts = mailReplyCommand.optsWithGlobals() as OutputOptions;
    const mailTarget = resolveMailTarget(target);
    const config = await getConfigOrThrow();

    let body = opts.body ?? "";
    if (opts.bodyFile) {
      body = await readFile(opts.bodyFile, "utf-8");
    }
    if (!body) {
      process.stderr.write("오류: --body 또는 --body-file을 지정하세요\n");
      process.exit(3);
    }

    const spinner = startSpinner(
      mailTarget.kind === "mailId" ? "메일 찾는 중..." : "원본 메일 조회 중...",
    );
    let original: Awaited<ReturnType<typeof getMail>>;
    let messageId: string | null;
    try {
      const { uid, mailbox } = await resolveMailUid(config, target);
      if (mailTarget.kind === "mailId") {
        spinner.text = "원본 메일 조회 중...";
      }
      original = await getMail(config, uid, mailbox);
      messageId = await getMessageId(config, uid, mailbox);
    } catch (error) {
      stopSpinner(false);
      throw error;
    }

    // Extract sender email for reply-to
    const fromMatch = original.from.match(/<(.+?)>/);
    const replyTo = fromMatch ? fromMatch[1] : original.from;

    stopSpinner(true, "원본 메일 조회 완료");

    startSpinner("답장 발송 중...");
    let result: Awaited<ReturnType<typeof sendMail>>;
    try {
      result = await sendMail(config, {
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
    } catch (error) {
      stopSpinner(false);
      throw error;
    }

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
