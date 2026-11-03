import { ImapFlow, type FetchMessageObject } from "imapflow";
import { simpleParser, type Attachment, type ParsedMail } from "mailparser";
import type { Config } from "../config/types.js";
import { DEFAULTS } from "../config/types.js";
import { DoorayCliError } from "../utils/errors.js";
import { EXIT_API_ERROR, EXIT_CONFIG_ERROR } from "../utils/exit-codes.js";
import { decodeDoorayIdTimeMs } from "../utils/dooray-id.js";
import { sanitizeFileName } from "../utils/attachment-check.js";
import { assignAttachmentFileNames } from "../utils/mail-attachment-name.js";
import { toMailConnectionError } from "./mailErrors.js";

// SEARCH SINCE/BEFORE 는 일자 단위라 질의에 앞뒤 하루씩을 준다 (ADR-040 의 보강 절).
// imapflow 가 정각이 아닌 BEFORE 를 하루 밀므로 실제로 받는 것은 UTC 사흘치다.
const MAIL_ID_SEARCH_DAY_MARGIN_MS = 24 * 60 * 60 * 1000;
// 후보 UID 를 fetch 에 넘길 때 한 번에 묶는 개수. UID 문자열이 길어져 서버가 거절하는 것을 막는다.
const MAIL_ID_FETCH_BATCH = 500;
// 후보가 이보다 많으면 UID 를 고르지 않고 중단한다.
// ADR-040 의 측정에서 후보가 8통에서 14통이었으므로 2000 은 그보다 충분히 크고,
// 상한에서의 왕복 1 + 2000/500 = 5 회가 종전 방식의 14회보다 적다.
const MAIL_ID_CANDIDATE_LIMIT = 2000;
const INBOX_SEARCH_HINT = '받은 메일함(INBOX) 대체 조회: dooray mail list --search "<제목 일부>"';

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

function formatEnvelopeAddress(
  address: { name?: string | null; address?: string | null } | undefined,
): string {
  if (!address) return "(unknown)";
  return `${address.name || ""} <${address.address || ""}>`;
}

function readInternalDate(value: FetchMessageObject["internalDate"], mailbox: string): Date {
  const date = typeof value === "string" ? new Date(value) : value;
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
    throw buildIncompleteLookupError(mailbox);
  }
  return date;
}

function buildMailIdCandidate(msg: FetchMessageObject, mailbox: string): MailIdCandidate {
  const envelope = msg.envelope ?? null;
  return {
    uid: msg.uid,
    subject: envelope?.subject ?? "(제목 없음)",
    from: envelope?.from?.[0] ? formatEnvelopeAddress(envelope.from[0]) : "(unknown)",
    date: readInternalDate(msg.internalDate, mailbox),
  };
}

function sanitizeCandidateText(value: string): string {
  return sanitizeFileName(value).replace(/[\x80-\x9F\u2028\u2029]/g, "?");
}

function formatMailCandidate(candidate: MailIdCandidate): string {
  return [
    `  UID: ${candidate.uid}`,
    `  도착 시각: ${candidate.date?.toISOString() ?? "(unknown)"}`,
    `  보낸사람: ${sanitizeCandidateText(candidate.from)}`,
    `  제목: ${sanitizeCandidateText(candidate.subject)}`,
  ].join("\n");
}

async function fetchMailIdCandidates(
  client: ImapFlow,
  uidList: number[],
  mailbox: string,
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
    if (!pendingUids.delete(msg.uid)) throw buildIncompleteLookupError(mailbox);
    candidates.push(buildMailIdCandidate(msg, mailbox));
  }

  if (pendingUids.size > 0) throw buildIncompleteLookupError(mailbox);

  candidates.sort((a, b) => a.uid - b.uid);
  return candidates;
}

function isCandidateMatch(candidate: MailIdCandidate, wantSec: number): boolean {
  if (!candidate.date) return false;
  const sec = Math.floor(candidate.date.getTime() / 1000);
  // id 시각이 도착보다 앞서므로 초 경계를 넘는 경우까지 두 초를 확인한다.
  return sec === wantSec || sec === wantSec + 1;
}

function mailboxLookupHint(mailbox: string): string {
  return mailbox.toUpperCase() === "INBOX"
    ? INBOX_SEARCH_HINT
    : `메일 웹 화면의 ${sanitizeCandidateText(mailbox)} 폴더에서 제목과 보낸사람으로 메일을 확인하세요.`;
}

function buildNoMatchError(mailId: string, mailbox: string): DoorayCliError {
  return new DoorayCliError(
    `메일을 찾을 수 없습니다: mail id ${mailId}, 사서함 ${sanitizeCandidateText(mailbox)}\n` +
      "메일이 다른 폴더로 이동되었거나 삭제되었을 수 있습니다.\n" +
      mailboxLookupHint(mailbox),
    EXIT_API_ERROR,
  );
}

function buildTooManyCandidatesError(
  mailId: string,
  mailbox: string,
  candidateCount: number,
): DoorayCliError {
  return new DoorayCliError(
    `사서함 ${sanitizeCandidateText(mailbox)}의 mail id ${mailId} 조회 범위에 메일이 ` +
      `${candidateCount}통이라 UID를 결정하지 않았습니다(상한 ${MAIL_ID_CANDIDATE_LIMIT}통).\n` +
      mailboxLookupHint(mailbox),
    EXIT_API_ERROR,
  );
}

function buildIncompleteLookupError(mailbox: string): DoorayCliError {
  return new DoorayCliError(
    `사서함 ${sanitizeCandidateText(mailbox)}의 도착 시각이나 조회 결과가 불완전해 UID를 결정할 수 없습니다. 다시 조회하세요.\n` +
      mailboxLookupHint(mailbox),
    EXIT_API_ERROR,
  );
}

function buildAmbiguousError(
  mailId: string,
  mailbox: string,
  candidates: MailIdCandidate[],
): DoorayCliError {
  const details = candidates.map(formatMailCandidate).join("\n");
  const safeMailbox = sanitizeCandidateText(mailbox);
  const guidance = mailbox.toUpperCase() === "INBOX"
    ? "받은 메일함(INBOX)의 후보 UID 하나를 골라 다시 조회하세요."
    : mailboxLookupHint(mailbox);
  return new DoorayCliError(
    `사서함 ${safeMailbox}에서 메일 id ${mailId}에 대응하는 메일이 여러 건입니다.\n${details}\n${guidance}`,
    EXIT_API_ERROR,
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
      const uids = await client.search(
        {
          since: new Date(wantMs - MAIL_ID_SEARCH_DAY_MARGIN_MS),
          before: new Date(wantMs + MAIL_ID_SEARCH_DAY_MARGIN_MS),
        },
        { uid: true },
      );
      if (!Array.isArray(uids) || uids.length === 0) {
        throw buildNoMatchError(mailId, mailbox);
      }
      if (uids.length > MAIL_ID_CANDIDATE_LIMIT) {
        throw buildTooManyCandidatesError(mailId, mailbox, uids.length);
      }

      const sortedUids = [...uids].sort((a: number, b: number) => a - b);
      const fetched: MailIdCandidate[] = [];
      for (let offset = 0; offset < sortedUids.length; offset += MAIL_ID_FETCH_BATCH) {
        fetched.push(
          ...(await fetchMailIdCandidates(
            client,
            sortedUids.slice(offset, offset + MAIL_ID_FETCH_BATCH),
            mailbox,
          )),
        );
      }
      const candidates = fetched.filter((candidate) => isCandidateMatch(candidate, wantSec));

      if (candidates.length === 1) {
        return candidates[0].uid;
      }

      if (candidates.length === 0) {
        throw buildNoMatchError(mailId, mailbox);
      }

      throw buildAmbiguousError(mailId, mailbox, candidates);
    } finally {
      lock.release();
    }
  } finally {
    await closeImapClient(client);
  }
}
