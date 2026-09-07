import { DoorayCliError } from "../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../utils/exit-codes.js";
import { parseDoorayMailUrl } from "../utils/dooray-url.js";
import type { Config } from "../config/types.js";
import { resolveUidByMailId } from "../api/imapClient.js";

export type MailInputTokenType = "url" | "mailId" | "uid" | "invalid";

export type MailTarget =
  | { kind: "uid"; uid: number; mailbox: string }
  | { kind: "mailId"; mailId: string; mailbox: string };

const MAIL_UID_MAX = 4294967295n;
const MAIL_INPUT_HINT =
  "지원 형식:\n" +
  "  <mail-uid>\n" +
  "  <mail-id>\n" +
  "  <Dooray mail URL>";

const DOORAY_MAILBOX_MAP = new Map<string, string>([
  ["inbox", "INBOX"],
  ["sent", "sent"],
  ["draft", "draft"],
  ["archive", "archive"],
  ["spam", "spam"],
  ["trash", "trash"],
]);

function isNumericToken(token: string): boolean {
  return /^\d+$/.test(token);
}

function mailboxFromDoorayFolder(folder: string | null): string {
  if (!folder) return "INBOX";
  return DOORAY_MAILBOX_MAP.get(folder) ?? "INBOX";
}

export function classifyMailInputToken(token: string): MailInputTokenType {
  if (/^https?:\/\//.test(token)) return "url";
  if (!isNumericToken(token)) return "invalid";
  const big = BigInt(token);
  if (big < 1n) return "invalid";
  if (big <= MAIL_UID_MAX) return "uid";
  return "mailId";
}

export function resolveMailTarget(token: string): MailTarget {
  const kind = classifyMailInputToken(token);

  if (kind === "uid") {
    return { kind: "uid", uid: Number(token), mailbox: "INBOX" };
  }

  if (kind === "mailId") {
    return { kind: "mailId", mailId: token, mailbox: "INBOX" };
  }

  if (kind === "url") {
    const parsed = parseDoorayMailUrl(token);
    if (!parsed) {
      throw new DoorayCliError(
        `메일 URL 형식이 올바르지 않습니다: "${token}"\n${MAIL_INPUT_HINT}`,
        EXIT_PARAM_ERROR,
      );
    }
    return {
      kind: "mailId",
      mailId: parsed.mailId,
      mailbox: mailboxFromDoorayFolder(parsed.mailbox),
    };
  }

  throw new DoorayCliError(
    `메일 입력 형식이 올바르지 않습니다: "${token}"\n${MAIL_INPUT_HINT}`,
    EXIT_PARAM_ERROR,
  );
}

export async function resolveMailUid(
  config: Config,
  token: string,
): Promise<{ uid: number; mailbox: string }> {
  const target = resolveMailTarget(token);

  if (target.kind === "uid") {
    return { uid: target.uid, mailbox: target.mailbox };
  }

  return {
    uid: await resolveUidByMailId(config, target.mailId, target.mailbox),
    mailbox: target.mailbox,
  };
}
