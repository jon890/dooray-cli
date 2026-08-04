import nodemailer from "nodemailer";
import type { Config } from "../config/types.js";
import { DEFAULTS } from "../config/types.js";
import { DoorayCliError } from "../utils/errors.js";
import { EXIT_CONFIG_ERROR } from "../utils/exit-codes.js";
import { toMailConnectionError } from "./mailErrors.js";

export interface SendMailOptions {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  html?: boolean;
  inReplyTo?: string;
  references?: string;
}

export interface SendMailResult {
  messageId: string;
  accepted: string[];
  rejected: string[];
}

export function getSmtpConfigOrThrow(config: Config) {
  if (!config.imapUsername || !config.imapPassword) {
    throw new DoorayCliError(
      "메일 설정이 완료되지 않았습니다. 먼저 설정을 진행하세요:\n" +
        "  dooray config set imap-username <YOUR_EMAIL>\n" +
        "  dooray config set imap-password <YOUR_IMAP_PASSWORD>",
      EXIT_CONFIG_ERROR,
    );
  }
  return {
    host: config.smtpHost ?? DEFAULTS.smtpHost,
    port: config.smtpPort ?? DEFAULTS.smtpPort,
    username: config.imapUsername,
    password: config.imapPassword,
  };
}

export async function sendMail(
  config: Config,
  opts: SendMailOptions,
): Promise<SendMailResult> {
  const smtp = getSmtpConfigOrThrow(config);

  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: true,
    auth: { user: smtp.username, pass: smtp.password },
  });

  const mailOptions: nodemailer.SendMailOptions = {
    from: smtp.username,
    to: opts.to.join(", "),
    subject: opts.subject,
    inReplyTo: opts.inReplyTo,
    references: opts.references,
  };

  if (opts.cc?.length) mailOptions.cc = opts.cc.join(", ");
  if (opts.bcc?.length) mailOptions.bcc = opts.bcc.join(", ");

  if (opts.html) {
    mailOptions.html = opts.body;
  } else {
    mailOptions.text = opts.body;
  }

  const info = await transporter.sendMail(mailOptions).catch((error: unknown) => {
    throw toMailConnectionError("SMTP", smtp.host, smtp.port, error);
  });

  return {
    messageId: info.messageId,
    accepted: (info.accepted ?? []) as string[],
    rejected: (info.rejected ?? []) as string[],
  };
}

export async function verifySmtp(config: Config): Promise<boolean> {
  const smtp = getSmtpConfigOrThrow(config);
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: true,
    auth: { user: smtp.username, pass: smtp.password },
  });

  try {
    await transporter.verify();
    return true;
  } catch {
    return false;
  }
}
