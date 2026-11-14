/** mail id 의 시각으로 후보를 찾아 유일한 IMAP UID 를 고른다. 연결과 잠금은 호출자가 관리한다. */
import type { ImapFlow, FetchMessageObject } from "imapflow";
import { DoorayCliError } from "@/utils/errors.js";
import { EXIT_API_ERROR } from "@/utils/exit-codes.js";
import { sanitizeForTerminal } from "@/utils/sanitize.js";

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

export interface MailIdCandidate {
  uid: number;
  subject: string;
  from: string;
  date: Date | null;
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
  return sanitizeForTerminal(value).replace(/[\x80-\x9F\u2028\u2029]/g, "?");
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

/** 연결된 사서함의 잠금을 가진 상태에서 호출한다. */
export async function lookupUidByMailId(
  client: ImapFlow,
  mailId: string,
  mailbox: string,
  wantMs: number,
): Promise<number> {
  const wantSec = Math.floor(wantMs / 1000);
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
}
