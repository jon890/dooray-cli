import { ImapFlow } from "imapflow";
import { simpleParser, type ParsedMail } from "mailparser";
import type { Config } from "../config/types.js";
import { DEFAULTS } from "../config/types.js";
import { DoorayCliError } from "../utils/errors.js";
import { EXIT_CONFIG_ERROR } from "../utils/exit-codes.js";
import { toMailConnectionError } from "./mailErrors.js";

export interface MailMessage {
  uid: number;
  subject: string;
  from: string;
  to: string[];
  date: Date | null;
  isRead: boolean;
  body?: string;
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
): Promise<MailMessage & { body: string }> {
  const client = createImapClient(config);

  try {
    await connectImapClient(client, config);
    const lock = await client.getMailboxLock("INBOX");

    try {
      const msg = await client.fetchOne(String(uid), {
        uid: true,
        flags: true,
        envelope: true,
        source: true,
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
        isRead: flags.has("\\Seen"),
        body,
      };
    } finally {
      lock.release();
    }
  } finally {
    await closeImapClient(client);
  }
}
