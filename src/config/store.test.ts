import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Config } from "./types.js";
import { EXIT_CONFIG_ERROR } from "../utils/exit-codes.js";
import {
  clearMailCredentials,
  getConfig,
  getConfigOrThrow,
  isConfig,
  removeMailCredentials,
  setConfigValue,
} from "./store.js";

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
    readFileMock.mockRejectedValueOnce(
      Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
    );

    await expect(clearMailCredentials()).resolves.toEqual({ state: "absent" });
    expect(writeFileMock).not.toHaveBeenCalled();
  });

  it("손상된 설정 파일이면 실패 이유를 돌려주고 저장하지 않는다", async () => {
    readFileMock.mockResolvedValueOnce("{");

    await expect(clearMailCredentials()).resolves.toMatchObject({
      state: "failed",
      reason: expect.stringContaining("손상"),
    });
    expect(writeFileMock).not.toHaveBeenCalled();
  });

  it("메일 인증정보를 지우고 있었는지 함께 돌려준다", async () => {
    readFileMock.mockResolvedValueOnce(
      JSON.stringify({
        version: 1,
        apiKey: "api-key",
        baseUrl: "https://api.dooray.com",
        imapUsername: "user@example.com",
        imapPassword: "secret",
      }),
    );

    await expect(clearMailCredentials()).resolves.toEqual({
      state: "cleared",
      hadCredentials: true,
    });
    expect(writeFileMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.not.stringContaining("secret"),
    );
  });
});

describe("getConfig", () => {
  it("파일이 없으면 absent 를 돌려준다", async () => {
    readFileMock.mockRejectedValueOnce(
      Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
    );

    await expect(getConfig()).resolves.toEqual({ state: "absent" });
  });

  it("깨진 JSON 이면 invalid 를 돌려준다", async () => {
    readFileMock.mockResolvedValueOnce("{");

    await expect(getConfig()).resolves.toMatchObject({ state: "invalid" });
  });

  it("필수 필드가 없으면 invalid 를 돌려준다", async () => {
    readFileMock.mockResolvedValueOnce(
      JSON.stringify({ version: 1, baseUrl: "https://api.dooray.com" }),
    );

    await expect(getConfig()).resolves.toMatchObject({
      state: "invalid",
      reason: expect.stringContaining("apiKey"),
    });
  });

  it("권한 오류면 unreadable 을 돌려준다", async () => {
    readFileMock.mockRejectedValueOnce(
      Object.assign(new Error("EACCES: permission denied"), {
        code: "EACCES",
      }),
    );

    await expect(getConfig()).resolves.toMatchObject({
      state: "unreadable",
      reason: expect.stringContaining("EACCES"),
    });
  });

  it("온전한 파일이면 ok 와 config 를 돌려준다", async () => {
    const config: Config = {
      version: 1,
      apiKey: "api-key",
      baseUrl: "https://api.dooray.com",
      tenantName: "example",
    };
    readFileMock.mockResolvedValueOnce(JSON.stringify(config));

    await expect(getConfig()).resolves.toEqual({ state: "ok", config });
  });
});

describe("isConfig", () => {
  it("필수 필드가 빠진 객체를 거짓으로 판정한다", () => {
    expect(isConfig({ version: 1, baseUrl: "https://api.dooray.com" })).toBe(
      false,
    );
  });

  it("선택 필드 타입이 다르면 거짓으로 판정한다", () => {
    expect(
      isConfig({
        version: 1,
        apiKey: "api-key",
        baseUrl: "https://api.dooray.com",
        imapPort: "993",
      }),
    ).toBe(false);
  });
});

describe("getConfigOrThrow", () => {
  it("invalid 에서 setup 을 안내하지 않고 손상을 알린다", async () => {
    readFileMock.mockResolvedValueOnce("{");

    try {
      await getConfigOrThrow();
      throw new Error("expected getConfigOrThrow to fail");
    } catch (err) {
      expect(err).toMatchObject({
        exitCode: EXIT_CONFIG_ERROR,
        message: expect.stringContaining("손상"),
      });
      expect(err).toMatchObject({
        message: expect.not.stringContaining("dooray setup"),
      });
    }
  });

  it("unreadable 에서 setup 을 안내하지 않는다", async () => {
    readFileMock.mockRejectedValueOnce(
      Object.assign(new Error("EACCES: permission denied"), {
        code: "EACCES",
      }),
    );

    await expect(getConfigOrThrow()).rejects.toMatchObject({
      exitCode: EXIT_CONFIG_ERROR,
      message: expect.not.stringContaining("dooray setup"),
    });
  });

  it("absent 에서 setup 을 안내한다", async () => {
    readFileMock.mockRejectedValueOnce(
      Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
    );

    await expect(getConfigOrThrow()).rejects.toMatchObject({
      exitCode: EXIT_CONFIG_ERROR,
      message: expect.stringContaining("dooray setup"),
    });
  });
});

describe("setConfigValue", () => {
  it("invalid 설정 파일을 기본값으로 덮어쓰지 않는다", async () => {
    readFileMock.mockResolvedValueOnce("{");

    await expect(setConfigValue("api-key", "new-key")).rejects.toMatchObject({
      exitCode: EXIT_CONFIG_ERROR,
      message: expect.stringContaining("손상"),
    });
    expect(writeFileMock).not.toHaveBeenCalled();
  });

  it("unreadable 설정 파일을 기본값으로 덮어쓰지 않는다", async () => {
    readFileMock.mockRejectedValueOnce(
      Object.assign(new Error("EACCES: permission denied"), {
        code: "EACCES",
      }),
    );

    await expect(setConfigValue("api-key", "new-key")).rejects.toMatchObject({
      exitCode: EXIT_CONFIG_ERROR,
      message: expect.not.stringContaining("dooray setup"),
    });
    expect(writeFileMock).not.toHaveBeenCalled();
  });
});
