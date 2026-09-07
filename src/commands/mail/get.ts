import { Command } from "commander";
import { getConfigOrThrow } from "../../config/store.js";
import { getMail } from "../../api/imapClient.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import type { OutputOptions } from "../../formatters/table.js";
import { printJson } from "../../formatters/table.js";
import { resolveMailTarget, resolveMailUid } from "../../resolvers/mail-input.js";
import chalk from "chalk";

export const mailGetCommand = new Command("get")
  .description("메일 상세 조회")
  .argument("<target>", "메일 UID / 메일 웹 주소 / 웹 주소의 mail id")
  .action(async (target) => {
    const globalOpts = mailGetCommand.optsWithGlobals() as OutputOptions;
    const mailTarget = resolveMailTarget(target);
    const config = await getConfigOrThrow();

    const spinner = startSpinner(
      mailTarget.kind === "mailId" ? "메일 찾는 중..." : "메일 조회 중...",
    );
    try {
      const { uid, mailbox } = await resolveMailUid(config, target);
      if (mailTarget.kind === "mailId") {
        spinner.text = "메일 조회 중...";
      }
      const mail = await getMail(config, uid, mailbox);
      stopSpinner(true, "메일 조회 완료");

      if (globalOpts.json) {
        printJson({
          uid: mail.uid,
          subject: mail.subject,
          from: mail.from,
          to: mail.to,
          date: mail.date?.toISOString() ?? null,
          isRead: mail.isRead,
          body: mail.body,
        });
      } else {
        process.stdout.write(
          `${chalk.bold("제목:")} ${mail.subject}\n` +
            `${chalk.bold("보낸사람:")} ${mail.from}\n` +
            `${chalk.bold("받는사람:")} ${mail.to.join(", ")}\n` +
            `${chalk.bold("날짜:")} ${mail.date?.toLocaleString("ko-KR") ?? ""}\n` +
            `${chalk.bold("읽음:")} ${mail.isRead ? "예" : "아니오"}\n` +
            `\n${mail.body}\n`,
        );
      }
    } catch (error) {
      stopSpinner(false);
      throw error;
    }
  });
