import nodemailer from "nodemailer";
import MailComposer from "nodemailer/lib/mail-composer/index.js";
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
  attachments?: { filename: string; path: string }[];
}

export interface SendMailResult {
  messageId: string;
  accepted: string[];
  rejected: string[];
}

// raw 는 SMTP 로 보낸 바이트 그대로다. 보낸메일함에 같은 원문을 넣는 데 쓴다 (ADR-077).
export interface SentMail extends SendMailResult {
  raw: Buffer;
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
): Promise<SentMail> {
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

  if (opts.attachments?.length) {
    mailOptions.attachments = opts.attachments.map(({ filename, path }) => ({ filename, path }));
  }

  if (opts.html) {
    mailOptions.html = opts.body;
  } else {
    mailOptions.text = opts.body;
  }

  // 원문을 한 번만 만들어 SMTP 발송과 보낸메일함 저장이 같은 바이트를 쓰게 한다.
  // 따로 두 번 만들면 Message-ID 와 Date 가 달라진다.
  const node = new MailComposer(mailOptions).compile();
  const messageId = node.messageId();
  const raw = await node.build();
  const recipients = [...opts.to, ...(opts.cc ?? []), ...(opts.bcc ?? [])];

  const info = await transporter
    .sendMail({ envelope: { from: smtp.username, to: recipients }, raw })
    .catch((error: unknown) => {
      throw toMailConnectionError("SMTP", smtp.host, smtp.port, error);
    });

  return {
    messageId,
    accepted: (info.accepted ?? []) as string[],
    rejected: (info.rejected ?? []) as string[],
    raw,
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
