import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Config } from "./types.js";
import {
  EXIT_CONFIG_ERROR,
  EXIT_IO_ERROR,
  EXIT_PARAM_ERROR,
} from "../utils/exit-codes.js";
import {
  clearMailCredentials,
  getConfig,
  getConfigOrThrow,
  isConfig,
  removeMailCredentials,
  saveConfig,
  setConfigValue,
} from "./store.js";

const {
  readFileMock,
  writeFileMock,
  mkdirMock,
  renameMock,
  chmodMock,
  unlinkMock,
} = vi.hoisted(() => ({
  readFileMock: vi.fn(),
  writeFileMock: vi.fn(),
  mkdirMock: vi.fn(),
  renameMock: vi.fn(),
  chmodMock: vi.fn(),
  unlinkMock: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  mkdir: mkdirMock,
  readFile: readFileMock,
  writeFile: writeFileMock,
  rename: renameMock,
  chmod: chmodMock,
  unlink: unlinkMock,
}));

const ENOENT = () => Object.assign(new Error("ENOENT"), { code: "ENOENT" });

function writtenConfig(): Record<string, unknown> {
  return JSON.parse(writeFileMock.mock.calls[0][1] as string);
}

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
      { mode: 0o600, flag: "wx" },
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

describe("config.json 저장 권한", () => {
  const TMP_PATTERN = /config\.json\.\d+\.[0-9a-f-]{36}\.tmp$/;

  it("디렉터리를 0o700 으로 맞추고 고유한 tmp 에 0o600 으로 쓴 뒤 rename 한다", async () => {
    readFileMock.mockRejectedValueOnce(ENOENT());

    await setConfigValue("api-key", "new-key");

    const dirMatcher = expect.stringMatching(/\.dooray$/);
    expect(mkdirMock).toHaveBeenCalledWith(dirMatcher, {
      recursive: true,
      mode: 0o700,
    });
    // 이미 있던 디렉터리에는 mkdir 의 mode 가 적용되지 않는다.
    expect(chmodMock).toHaveBeenCalledWith(dirMatcher, 0o700);
    const [tmpPath, , options] = writeFileMock.mock.calls[0];
    expect(tmpPath).toMatch(TMP_PATTERN);
    expect(tmpPath).toContain(`.${process.pid}.`);
    expect(options).toEqual({ mode: 0o600, flag: "wx" });
    expect(renameMock).toHaveBeenCalledWith(
      tmpPath,
      expect.stringMatching(/config\.json$/),
    );
    expect(unlinkMock).not.toHaveBeenCalled();
  });

  it("저장할 때마다 다른 tmp 이름을 쓴다", async () => {
    readFileMock.mockRejectedValueOnce(ENOENT()).mockRejectedValueOnce(ENOENT());

    await setConfigValue("api-key", "a");
    await setConfigValue("api-key", "b");

    const [first, second] = writeFileMock.mock.calls.map((c) => c[0]);
    expect(first).toMatch(TMP_PATTERN);
    expect(second).toMatch(TMP_PATTERN);
    expect(first).not.toBe(second);
  });

  it("디렉터리 chmod 가 실패해도 저장은 끝난다", async () => {
    readFileMock.mockRejectedValueOnce(ENOENT());
    chmodMock.mockRejectedValueOnce(
      Object.assign(new Error("EPERM"), { code: "EPERM" }),
    );

    await expect(setConfigValue("api-key", "new-key")).resolves.toBeUndefined();
    expect(renameMock).toHaveBeenCalledTimes(1);
  });

  it("rename 이 실패하면 tmp 를 지우고 EXIT_IO_ERROR 로 감싼다", async () => {
    readFileMock.mockRejectedValueOnce(ENOENT());
    const original = Object.assign(new Error("EXDEV: cross-device link"), {
      code: "EXDEV",
    });
    renameMock.mockRejectedValueOnce(original);
    unlinkMock.mockResolvedValueOnce(undefined);

    await expect(setConfigValue("api-key", "new-key")).rejects.toMatchObject({
      name: "DoorayCliError",
      exitCode: EXIT_IO_ERROR,
      message: expect.stringContaining("EXDEV"),
      cause: original,
    });
    expect(unlinkMock).toHaveBeenCalledWith(writeFileMock.mock.calls[0][0]);
  });

  it("tmp 삭제까지 실패해도 원래 오류를 알린다", async () => {
    const original = Object.assign(new Error("EACCES"), { code: "EACCES" });
    renameMock.mockRejectedValueOnce(original);
    unlinkMock.mockRejectedValueOnce(new Error("ENOENT"));

    await expect(
      saveConfig({ version: 1, apiKey: "k", baseUrl: "https://api.dooray.com" }),
    ).rejects.toMatchObject({ exitCode: EXIT_IO_ERROR, cause: original });
  });
});

describe("setConfigValue 값 검증", () => {
  it.each(["abc", "", "0", "65536", "-1", "99.5", "993abc"])(
    "포트 값 %j 는 저장하지 않고 EXIT_PARAM_ERROR 로 거절한다",
    async (value) => {
      readFileMock.mockRejectedValueOnce(ENOENT());

      await expect(setConfigValue("imap-port", value)).rejects.toMatchObject({
        exitCode: EXIT_PARAM_ERROR,
        message: expect.stringContaining("imap-port"),
      });
      expect(writeFileMock).not.toHaveBeenCalled();
    },
  );

  it("smtp-port 도 범위 밖이면 거절한다", async () => {
    readFileMock.mockRejectedValueOnce(ENOENT());

    await expect(setConfigValue("smtp-port", "70000")).rejects.toMatchObject({
      exitCode: EXIT_PARAM_ERROR,
    });
    expect(writeFileMock).not.toHaveBeenCalled();
  });

  it.each([
    ["imap-port", "993", "imapPort", 993],
    ["smtp-port", "1", "smtpPort", 1],
    ["smtp-port", "65535", "smtpPort", 65535],
  ])("%s %s 는 숫자로 저장한다", async (key, value, field, expected) => {
    readFileMock.mockRejectedValueOnce(ENOENT());

    await setConfigValue(key, value);

    expect(writtenConfig()[field]).toBe(expected);
  });

  it.each([
    ["true", true],
    ["TRUE", true],
    ["yes", true],
    ["1", true],
    ["false", false],
    ["no", false],
    ["0", false],
  ])("track-last-run %j 는 %s 로 저장한다", async (value, expected) => {
    readFileMock.mockRejectedValueOnce(ENOENT());

    await setConfigValue("track-last-run", value);

    expect(writtenConfig().trackLastRun).toBe(expected);
  });

  it.each(["ture", "on", "", "2"])(
    "track-last-run %j 는 거절한다",
    async (value) => {
      readFileMock.mockRejectedValueOnce(ENOENT());

      await expect(
        setConfigValue("track-last-run", value),
      ).rejects.toMatchObject({ exitCode: EXIT_PARAM_ERROR });
      expect(writeFileMock).not.toHaveBeenCalled();
    },
  );
});
