import { describe, expect, it } from "vitest";
import type { Config } from "./types.js";
import { removeMailCredentials } from "./store.js";

describe("removeMailCredentials", () => {
  it("메일 인증정보만 제거하고 API 및 서버 설정은 보존한다", () => {
    const config: Config = {
      version: 1,
      apiKey: "api-key",
      baseUrl: "https://api.dooray.com",
      tenantName: "example",
      imapHost: "imap.example.com",
      imapPort: 993,
      imapUsername: "user@example.com",
      imapPassword: "secret",
      smtpHost: "smtp.example.com",
      smtpPort: 465,
      trackLastRun: true,
    };

    const result = removeMailCredentials(config);

    expect(result.imapUsername).toBeUndefined();
    expect(result.imapPassword).toBeUndefined();
    expect(result).toMatchObject({
      apiKey: "api-key",
      baseUrl: "https://api.dooray.com",
      imapHost: "imap.example.com",
      imapPort: 993,
      smtpHost: "smtp.example.com",
      smtpPort: 465,
    });
    expect(config.imapPassword).toBe("secret");
  });
});
