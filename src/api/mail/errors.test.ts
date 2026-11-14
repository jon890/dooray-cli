import { describe, expect, it, vi } from "vitest";
import type { ImapFlow } from "imapflow";
import { closeImapClient, connectImapClient } from "./imapClient.js";
import { toMailConnectionError } from "./mailErrors.js";
import { EXIT_API_ERROR, EXIT_AUTH_ERROR } from "../utils/exit-codes.js";
import type { Config } from "../config/types.js";

const config: Config = {
  version: 1,
  apiKey: "api-key",
  baseUrl: "https://api.dooray.com",
  imapHost: "imap.example.com",
  imapPort: 993,
  imapUsername: "user@example.com",
  imapPassword: "secret",
};

describe("메일 연결 오류", () => {
  it("IMAP 인증 실패를 앱 비밀번호 갱신 안내로 변환한다", async () => {
    const client = {
      connect: vi.fn().mockRejectedValue(
        Object.assign(new Error("Command failed"), {
          authenticationFailed: true,
          responseText: "AUTHENTICATE LOGIN FAILED!!",
        }),
      ),
    };

    await expect(connectImapClient(client, config)).rejects.toMatchObject({
      exitCode: EXIT_AUTH_ERROR,
      message: expect.stringContaining("앱 비밀번호를 새로 발급"),
    });
  });

  it("SMTP EAUTH 오류를 인증 실패로 분류한다", () => {
    const error = toMailConnectionError(
      "SMTP",
      "smtp.example.com",
      465,
      Object.assign(new Error("Invalid login"), { code: "EAUTH" }),
    );

    expect(error.exitCode).toBe(EXIT_AUTH_ERROR);
    expect(error.message).toContain("SMTP 인증에 실패");
  });

  it("일반 연결 실패에는 서버 주소와 원인을 남긴다", () => {
    const error = toMailConnectionError(
      "IMAP",
      "imap.example.com",
      993,
      Object.assign(new Error("connection refused"), {
        code: "ECONNREFUSED",
      }),
    );

    expect(error.exitCode).toBe(EXIT_API_ERROR);
    expect(error.message).toContain("imap.example.com:993");
    expect(error.message).toContain("connection refused");
  });

  it("SMTP 메시지 오류를 서버 연결 실패로 오인하지 않는다", () => {
    const error = toMailConnectionError(
      "SMTP",
      "smtp.example.com",
      465,
      Object.assign(new Error("Invalid recipient"), { code: "EENVELOPE" }),
    );

    expect(error.exitCode).toBe(EXIT_API_ERROR);
    expect(error.message).toContain("SMTP 처리 중 오류");
    expect(error.message).toContain("Invalid recipient");
    expect(error.message).not.toContain("서버 연결에 실패");
    expect(error.message).not.toContain("smtp.example.com:465");
  });
});

describe("IMAP 연결 정리", () => {
  it("연결되지 않은 클라이언트에서 logout 오류로 원인을 덮어쓰지 않는다", async () => {
    const client = {
      usable: false,
      logout: vi.fn(),
      close: vi.fn(),
    } as unknown as Pick<ImapFlow, "usable" | "logout" | "close">;

    await closeImapClient(client);

    expect(client.logout).not.toHaveBeenCalled();
    expect(client.close).toHaveBeenCalledOnce();
  });

  it("logout 실패 시 연결을 강제로 정리한다", async () => {
    const client = {
      usable: true,
      logout: vi.fn().mockRejectedValue(new Error("Connection not available")),
      close: vi.fn(),
    } as unknown as Pick<ImapFlow, "usable" | "logout" | "close">;

    await closeImapClient(client);

    expect(client.close).toHaveBeenCalledOnce();
  });
});
