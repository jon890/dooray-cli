import { ImapFlow } from "imapflow";
import { simpleParser, type Attachment, type ParsedMail } from "mailparser";
import type { Config } from "@/config/types.js";
import { DEFAULTS } from "@/config/types.js";
import { DoorayCliError } from "@/utils/errors.js";
import { EXIT_API_ERROR, EXIT_CONFIG_ERROR } from "@/utils/exit-codes.js";
import { decodeDoorayIdTimeMs } from "@/utils/dooray-id.js";
import { assignAttachmentFileNames } from "./attachment-name.js";
import { toMailConnectionError } from "./errors.js";
import { lookupUidByMailId } from "./uid-lookup.js";

export type { MailIdCandidate } from "./uid-lookup.js";

export interface MailMessage {
  uid: number;
  subject: string;
  from: string;
  to: string[];
  date: Date | null;
  isRead: boolean;
  body?: string;
}

// 첨부의 식별자는 parsed.attachments 의 순번(1부터)이다. IMAP 에는 안정적인 첨부 ID 가 없다 (ADR-071).
export interface MailAttachmentInfo {
  index: number;
  fileName: string;
  size: number;
  contentType: string;
  inline: boolean;
}

export function getImapConfigOrThrow(config: Config) {
  if (!config.imapUsername || !config.imapPassword) {
    throw new DoorayCliError(
      "IMAP 설정이 완료되지 않았습니다. 먼저 설정을 진행하세요:\n" +
        "  dooray config set imap-username <YOUR_EMAIL>\n" +
        "  dooray config set imap-password <YOUR_IMAP_PASSWORD>",
      EXIT_CONFIG_ERROR,
    );
  }
  return {
    host: config.imapHost ?? DEFAULTS.imapHost,
    port: config.imapPort ?? DEFAULTS.imapPort,
    username: config.imapUsername,
    password: config.imapPassword,
  };
}

export function createImapClient(config: Config): ImapFlow {
  const imap = getImapConfigOrThrow(config);
  return new ImapFlow({
    host: imap.host,
    port: imap.port,
    secure: true,
    auth: { user: imap.username, pass: imap.password },
    logger: false,
  });
}

export async function connectImapClient(
  client: Pick<ImapFlow, "connect">,
  config: Config,
): Promise<void> {
  const imap = getImapConfigOrThrow(config);
  try {
    await client.connect();
  } catch (error) {
    throw toMailConnectionError("IMAP", imap.host, imap.port, error);
  }
}

export async function closeImapClient(
  client: Pick<ImapFlow, "usable" | "logout" | "close">,
): Promise<void> {
  if (!client.usable) {
    client.close();
    return;
  }

  try {
    await client.logout();
  } catch {
    client.close();
  }
}

export interface SaveToSentResult {
  saved: boolean;
  reason?: string;
}

// 발송은 이미 끝난 뒤라 어떤 실패도 던지지 않고 결과로 돌려준다 (ADR-077).
// 보낸메일함은 이름으로 추측하지 않고 서버가 \Sent 특수 용도로 알린 메일함만 쓴다.
export async function saveToSent(config: Config, raw: Buffer): Promise<SaveToSentResult> {
  let client: ImapFlow;
  try {
    client = createImapClient(config);
  } catch (error) {
    return { saved: false, reason: errorMessage(error) };
  }

  try {
    await connectImapClient(client, config);
    const boxes = await client.list();
    const sent = boxes.find((box) => box.specialUse === "\\Sent" && box.specialUseSource !== "name");
    if (!sent) {
      return { saved: false, reason: "서버가 \\Sent 특수 용도 메일함을 알리지 않았습니다" };
    }
    const result = await client.append(sent.path, raw, ["\\Seen"], new Date());
    if (!result) {
      return { saved: false, reason: `${sent.path} 에 저장하지 못했습니다` };
    }
    return { saved: true };
  } catch (error) {
    return { saved: false, reason: errorMessage(error) };
  } finally {
    await closeImapClient(client);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function listMails(
  config: Config,
  opts: { unread?: boolean; search?: string; limit?: number },
): Promise<MailMessage[]> {
  const client = createImapClient(config);
  const limit = opts.limit ?? 20;

  try {
    await connectImapClient(client, config);
    const lock = await client.getMailboxLock("INBOX");

    try {
      // Build search query
      const query: Record<string, unknown> = {};
      if (opts.unread) query.seen = false;
      if (opts.search) query.subject = opts.search;
      if (Object.keys(query).length === 0) query.all = true;

      const uids = await client.search(query, { uid: true });
      if (!Array.isArray(uids) || uids.length === 0) return [];

      // Take latest N UIDs (highest UID = newest)
      const sorted = uids.sort((a: number, b: number) => b - a).slice(0, limit);
      const uidSet = sorted.join(",");

      const messages: MailMessage[] = [];
      for await (const msg of client.fetch(uidSet, {
        uid: true,
        flags: true,
        envelope: true,
      }, { uid: true })) {
        const { envelope, flags } = msg;
        if (!envelope || !flags) continue;
        messages.push({
          uid: msg.uid,
          subject: envelope.subject ?? "(제목 없음)",
          from: envelope.from?.[0]
            ? `${envelope.from[0].name || ""} <${envelope.from[0].address || ""}>`
            : "(unknown)",
          to: (envelope.to ?? []).map(
            (t) => `${t.name || ""} <${t.address || ""}>`,
          ),
          date: envelope.date ?? null,
          isRead: flags.has("\\Seen"),
        });
      }

      // Sort by UID descending (newest first)
      messages.sort((a, b) => b.uid - a.uid);
      return messages;
    } finally {
      lock.release();
    }
  } finally {
    await closeImapClient(client);
  }
}

export async function getMail(
  config: Config,
  uid: number,
  mailbox = "INBOX",
): Promise<MailMessage & {
  body: string;
  internalDate: Date | null;
  messageId: string | null;
  attachments: MailAttachmentInfo[];
}> {
  const client = createImapClient(config);

  try {
    await connectImapClient(client, config);
    const lock = await client.getMailboxLock(mailbox);

    try {
      const msg = await client.fetchOne(String(uid), {
        uid: true,
        flags: true,
        envelope: true,
        source: true,
        internalDate: true,
      }, { uid: true });

      if (!msg) {
        throw new DoorayCliError(`메일을 찾을 수 없습니다: UID ${uid}`, 1);
      }
      const { envelope, flags, source } = msg;
      if (!envelope || !flags || !source) {
        throw new DoorayCliError(
          `메일 메타데이터가 불완전합니다 (UID ${uid}): envelope/flags/source 누락`,
          1,
        );
      }

      const parsed: ParsedMail = await simpleParser(source);
      // parsed.html can be false (mailparser); || collapses false and empty string both → fallback
      const body: string = parsed.text || (parsed.html || "") || "(본문 없음)";
      const internalDate = typeof msg.internalDate === "string"
        ? new Date(msg.internalDate)
        : msg.internalDate;

      return {
        uid: msg.uid,
        subject: envelope.subject ?? "(제목 없음)",
        from: envelope.from?.[0]
          ? `${envelope.from[0].name || ""} <${envelope.from[0].address || ""}>`
          : "(unknown)",
        to: (envelope.to ?? []).map(
          (t) => `${t.name || ""} <${t.address || ""}>`,
        ),
        date: envelope.date ?? null,
        internalDate: internalDate instanceof Date && Number.isFinite(internalDate.getTime())
          ? internalDate
          : null,
        // 답장이 In-Reply-To 로 쓴다. 이미 받은 envelope 에서 꺼내 IMAP 연결을 한 번 아낀다.
        messageId: envelope.messageId ?? null,
        isRead: flags.has("\\Seen"),
        body,
        attachments: toAttachmentInfos(parsed.attachments).map(({ info }) => info),
      };
    } finally {
      lock.release();
    }
  } finally {
    await closeImapClient(client);
  }
}

function toAttachmentInfos(
  attachments: Attachment[],
): Array<{ info: MailAttachmentInfo; content: Buffer }> {
  const names = assignAttachmentFileNames(
    attachments.map((attachment, i) => ({ index: i + 1, filename: attachment.filename })),
  );
  return attachments.map((attachment, i) => ({
    info: {
      index: i + 1,
      fileName: names.get(i + 1) ?? `attachment-${i + 1}`,
      size: attachment.size,
      contentType: attachment.contentType,
      inline: attachment.contentDisposition === "inline" || attachment.related === true,
    },
    content: attachment.content,
  }));
}

export async function getMailAttachments(
  config: Config,
  uid: number,
  mailbox = "INBOX",
): Promise<{ subject: string; attachments: Array<MailAttachmentInfo & { content: Buffer }> }> {
  const client = createImapClient(config);

  try {
    await connectImapClient(client, config);
    const lock = await client.getMailboxLock(mailbox);

    try {
      const msg = await client.fetchOne(String(uid), {
        uid: true,
        envelope: true,
        source: true,
      }, { uid: true });

      if (!msg) {
        throw new DoorayCliError(`메일을 찾을 수 없습니다: UID ${uid}`, 1);
      }
      if (!msg.source) {
        throw new DoorayCliError(
          `메일 메타데이터가 불완전합니다 (UID ${uid}): source 누락`,
          1,
        );
      }

      const parsed: ParsedMail = await simpleParser(msg.source);
      return {
        subject: msg.envelope?.subject ?? "(제목 없음)",
        attachments: toAttachmentInfos(parsed.attachments).map(({ info, content }) => ({
          ...info,
          content,
        })),
      };
    } finally {
      lock.release();
    }
  } finally {
    await closeImapClient(client);
  }
}

export async function resolveUidByMailId(
  config: Config,
  mailId: string,
  mailbox: string,
): Promise<number> {
  const wantMs = decodeDoorayIdTimeMs(mailId);
  const client = createImapClient(config);

  try {
    await connectImapClient(client, config);
    const lock = await client.getMailboxLock(mailbox);

    try {
      return await lookupUidByMailId(client, mailId, mailbox, wantMs);
    } finally {
      lock.release();
    }
  } finally {
    await closeImapClient(client);
  }
}
