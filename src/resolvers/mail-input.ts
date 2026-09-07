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
  // systems 경로가 아닌 주소는 폴더를 알 수 없어 INBOX 로 조회한다.
  if (!folder) return "INBOX";

  // 브라우저 주소창에서 복사한 주소는 /mail/systems/Sent/ 처럼 대문자가 섞여 온다.
  const mailbox = DOORAY_MAILBOX_MAP.get(folder.toLowerCase());
  if (mailbox) return mailbox;

  // 매핑 밖 폴더를 INBOX 로 대체하면 사용자는 자기 폴더가 무시된 것을 모른 채
  // INBOX 에 없다는 오류만 받는다. 지원 목록과 함께 거절한다.
  throw new DoorayCliError(
    `지원하지 않는 메일 폴더입니다: "${folder}"\n` +
      `지원 폴더: ${[...DOORAY_MAILBOX_MAP.keys()].join(", ")}\n` +
      "그 폴더의 메일은 UID 로 조회하세요: dooray mail list --search \"<제목 일부>\"",
    EXIT_PARAM_ERROR,
  );
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
