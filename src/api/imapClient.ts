import { ImapFlow, type FetchMessageObject } from "imapflow";
import { simpleParser, type ParsedMail } from "mailparser";
import type { Config } from "../config/types.js";
import { DEFAULTS } from "../config/types.js";
import { DoorayCliError } from "../utils/errors.js";
import { EXIT_CONFIG_ERROR } from "../utils/exit-codes.js";
import { decodeDoorayIdTimeMs } from "../utils/dooray-id.js";
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

export interface MailIdCandidate {
  uid: number;
  subject: string;
  from: string;
  date: Date | null;
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
  mailbox = "INBOX",
): Promise<MailMessage & { body: string }> {
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

function formatEnvelopeAddress(
  address: { name?: string | null; address?: string | null } | undefined,
): string {
  if (!address) return "(unknown)";
  return `${address.name || ""} <${address.address || ""}>`;
}

function readInternalDate(value: FetchMessageObject["internalDate"]): Date {
  const date = typeof value === "string" ? new Date(value) : value;
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
    throw buildIncompleteLookupError();
  }
  return date;
}

function buildMailIdCandidate(msg: FetchMessageObject): MailIdCandidate {
  const envelope = msg.envelope ?? null;
  return {
    uid: msg.uid,
    subject: envelope?.subject ?? "(제목 없음)",
    from: envelope?.from?.[0] ? formatEnvelopeAddress(envelope.from[0]) : "(unknown)",
    date: readInternalDate(msg.internalDate),
  };
}

function formatMailCandidate(candidate: MailIdCandidate): string {
  return [
    `  UID: ${candidate.uid}`,
    `  도착 시각: ${candidate.date?.toISOString() ?? "(unknown)"}`,
    `  보낸사람: ${candidate.from}`,
    `  제목: ${candidate.subject}`,
  ].join("\n");
}

async function fetchMailIdCandidates(
  client: ImapFlow,
  uidList: number[],
): Promise<MailIdCandidate[]> {
  const candidates: MailIdCandidate[] = [];
  if (uidList.length === 0) return candidates;

  const uidSet = uidList.join(",");
  const pendingUids = new Set(uidList);
  for await (const msg of client.fetch(
    uidSet,
    { uid: true, envelope: true, internalDate: true },
    { uid: true },
  )) {
    if (!pendingUids.delete(msg.uid)) throw buildIncompleteLookupError();
    candidates.push(buildMailIdCandidate(msg));
  }

  if (pendingUids.size > 0) throw buildIncompleteLookupError();

  candidates.sort((a, b) => a.uid - b.uid);
  return candidates;
}

function isCandidateMatch(candidate: MailIdCandidate, wantSec: number): boolean {
  if (!candidate.date) return false;
  const sec = Math.floor(candidate.date.getTime() / 1000);
  return sec === wantSec || sec === wantSec + 1;
}

function buildNoMatchError(mailId: string): DoorayCliError {
  return new DoorayCliError(
    `메일을 찾을 수 없습니다: mail id ${mailId}\n` +
      "메일이 다른 폴더로 이동되었거나 삭제되었을 수 있습니다.\n" +
      '대체 조회: dooray mail list --search "<제목 일부>"',
    1,
  );
}

function buildIncompleteLookupError(): DoorayCliError {
  return new DoorayCliError(
    "메일의 도착 시각이나 조회 결과가 불완전해 UID를 결정할 수 없습니다. 다시 조회하세요.\n" +
      '대체 조회: dooray mail list --search "<제목 일부>"',
    1,
  );
}

function buildAmbiguousError(mailId: string, candidates: MailIdCandidate[]): DoorayCliError {
  const details = candidates.map(formatMailCandidate).join("\n");
  return new DoorayCliError(
    `메일 id ${mailId} 에 대응하는 메일이 여러 건입니다.\n${details}\n` +
      "UID 하나를 골라 다시 조회하세요.",
    1,
  );
}

export async function resolveUidByMailId(
  config: Config,
  mailId: string,
  mailbox: string,
): Promise<number> {
  const wantMs = decodeDoorayIdTimeMs(mailId);
  const wantSec = Math.floor(wantMs / 1000);
  const client = createImapClient(config);

  try {
    await connectImapClient(client, config);
    const lock = await client.getMailboxLock(mailbox);

    try {
      const uids = await client.search({ all: true }, { uid: true });
      if (!Array.isArray(uids) || uids.length === 0) {
        throw buildNoMatchError(mailId);
      }

      const sortedUids = [...uids].sort((a: number, b: number) => a - b);
      let lo = 0;
      let hi = sortedUids.length;

      while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2);
        const msg = await client.fetchOne(
          String(sortedUids[mid]),
          { uid: true, internalDate: true },
          { uid: true },
        );
        if (!msg || msg.uid !== sortedUids[mid]) throw buildIncompleteLookupError();
        const internalDateMs = readInternalDate(msg.internalDate).getTime();

        if (internalDateMs < wantMs - 2000) {
          lo = mid + 1;
        } else {
          hi = mid;
        }
      }

      const start = Math.max(0, lo - 8);
      const end = Math.min(sortedUids.length, lo + 9);
      const candidates = (await fetchMailIdCandidates(
        client,
        sortedUids.slice(start, end),
      )).filter((candidate) => isCandidateMatch(candidate, wantSec));

      if (candidates.length === 1) {
        // 범위 끝이 일치하면 다음 UID도 같은 초에 도착했을 수 있다.
        if (end < sortedUids.length && candidates[0].uid === sortedUids[end - 1]) {
          throw new DoorayCliError(
            "조회 범위 밖에도 같은 시각의 메일이 있을 수 있어 UID를 결정할 수 없습니다.\n" +
              `${formatMailCandidate(candidates[0])}\n` +
              '대체 조회: dooray mail list --search "<제목 일부>"',
            1,
          );
        }
        return candidates[0].uid;
      }

      if (candidates.length === 0) {
        throw buildNoMatchError(mailId);
      }

      throw buildAmbiguousError(mailId, candidates);
    } finally {
      lock.release();
    }
  } finally {
    await closeImapClient(client);
  }
}
