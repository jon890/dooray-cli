import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Config } from "./types.js";
import { clearMailCredentials, removeMailCredentials } from "./store.js";

const { readFileMock, writeFileMock } = vi.hoisted(() => ({
  readFileMock: vi.fn(),
  writeFileMock: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn(),
  readFile: readFileMock,
  writeFile: writeFileMock,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

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

describe("clearMailCredentials", () => {
  it("설정 파일이 없으면 제거할 항목이 없는 것으로 처리한다", async () => {
    readFileMock.mockRejectedValueOnce(new Error("ENOENT"));

    await expect(clearMailCredentials()).resolves.toBe(false);
    expect(writeFileMock).not.toHaveBeenCalled();
  });
});
