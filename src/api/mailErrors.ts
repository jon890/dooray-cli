import { DoorayCliError } from "../utils/errors.js";
import { EXIT_API_ERROR, EXIT_AUTH_ERROR } from "../utils/exit-codes.js";

type MailProtocol = "IMAP" | "SMTP";

function getErrorField(error: unknown, key: string): unknown {
  if (typeof error !== "object" || error === null) return undefined;
  return (error as Record<string, unknown>)[key];
}

function isAuthenticationFailure(error: unknown): boolean {
  if (getErrorField(error, "authenticationFailed") === true) return true;
  if (getErrorField(error, "code") === "EAUTH") return true;

  const details = [
    getErrorField(error, "message"),
    getErrorField(error, "responseText"),
    getErrorField(error, "responseCode"),
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ");

  return /auth(?:enticate|entication)?\s*(?:login\s*)?failed|invalid login|invalid credentials/i.test(
    details,
  );
}

export function toMailConnectionError(
  protocol: MailProtocol,
  host: string,
  port: number,
  error: unknown,
): DoorayCliError {
  if (isAuthenticationFailure(error)) {
    return new DoorayCliError(
      `${protocol} 인증에 실패했습니다. Dooray 메일 설정에서 앱 비밀번호를 새로 발급한 뒤 다시 저장하세요:\n` +
        "  dooray config set imap-password <NEW_IMAP_APP_PASSWORD>\n" +
        "기존 메일 인증정보 제거: dooray mail logout",
      EXIT_AUTH_ERROR,
    );
  }

  const reason =
    error instanceof Error && error.message ? `: ${error.message}` : "";
  return new DoorayCliError(
    `${protocol} 서버 연결에 실패했습니다 (${host}:${port})${reason}`,
    EXIT_API_ERROR,
  );
}
