import { Command } from "commander";
import { getConfigOrThrow } from "../../config/store.js";
import { listMails } from "@/api/mail/imap.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import type { OutputOptions } from "../../formatters/table.js";
import { output } from "../../formatters/table.js";
import chalk from "chalk";

export const mailListCommand = new Command("list")
  .description("메일 목록 조회")
  .option("--unread", "안읽은 메일만")
  .option("--search <keyword>", "제목 검색")
  .option("--size <number>", "조회 개수", "20")
  .action(async (opts) => {
    const globalOpts = mailListCommand.optsWithGlobals() as OutputOptions;
    const config = await getConfigOrThrow();

    startSpinner("메일 조회 중...");
    const mails = await listMails(config, {
      unread: opts.unread,
      search: opts.search,
      limit: Number(opts.size),
    });
    stopSpinner(true, `메일 ${mails.length}건 조회 완료`);

    output(globalOpts, {
      headers: ["UID", "읽음", "날짜", "보낸사람", "제목"],
      rows: mails.map((m) => [
        String(m.uid),
        m.isRead ? "✓" : chalk.red("✗"),
        m.date ? m.date.toLocaleDateString("ko-KR") : "",
        m.from.replace(/<.*>/, "").trim() || m.from,
        m.subject,
      ]),
      raw: mails.map((m) => ({
        uid: m.uid,
        subject: m.subject,
        from: m.from,
        to: m.to,
        date: m.date?.toISOString() ?? null,
        isRead: m.isRead,
      })),
      ids: mails.map((m) => String(m.uid)),
    });
  });
