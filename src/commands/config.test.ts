import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DoorayCliError } from "../utils/errors.js";
import { EXIT_CONFIG_ERROR, EXIT_PARAM_ERROR } from "../utils/exit-codes.js";

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
  updateConfigValue: vi.fn(),
}));

// 안내 문구는 실제 configReadErrorMessage 를 쓴다. 저장 함수는 이 테스트에서 불리지 않는다.
vi.mock("../config/store.js", async (importOriginal) => ({
  configReadErrorMessage: (
    await importOriginal<typeof import("../config/store.js")>()
  ).configReadErrorMessage,
  getConfig: mocks.getConfig,
}));
vi.mock("../services/config.js", () => ({
  updateConfigValue: mocks.updateConfigValue,
}));

async function runConfig(args: string[]): Promise<void> {
  vi.resetModules();
  const { configCommand } = await import("./config.js");
  await configCommand.parseAsync(args, { from: "user" });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("config 명령 오류 처리", () => {
  it("config set 의 오류는 process.exit 없이 종료 코드를 담아 던진다", async () => {
    const exit = vi.spyOn(process, "exit");
    mocks.updateConfigValue.mockRejectedValue(
      new DoorayCliError("imap-port 값이 올바르지 않습니다: abc", EXIT_PARAM_ERROR),
    );

    await expect(runConfig(["set", "imap-port", "abc"])).rejects.toMatchObject({
      exitCode: EXIT_PARAM_ERROR,
      message: expect.stringContaining("imap-port"),
    });
    expect(exit).not.toHaveBeenCalled();
  });

  it("config get 은 설정 파일이 없으면 EXIT_CONFIG_ERROR 를 던진다", async () => {
    const exit = vi.spyOn(process, "exit");
    mocks.getConfig.mockResolvedValue({ state: "absent" });

    await expect(runConfig(["get"])).rejects.toMatchObject({
      name: "DoorayCliError",
      exitCode: EXIT_CONFIG_ERROR,
      message: "설정 파일이 없습니다. dooray config set 으로 설정하세요.",
    });
    expect(exit).not.toHaveBeenCalled();
  });

  it("config get 은 키체인 읽기 실패를 설정 파일 부재로 안내하지 않는다", async () => {
    mocks.getConfig.mockResolvedValue({
      state: "unreadable",
      reason: "macOS 키체인에서 apiKey 를 읽지 못했습니다.",
      source: "keychain",
    });

    await expect(runConfig(["get"])).rejects.toMatchObject({
      name: "DoorayCliError",
      exitCode: EXIT_CONFIG_ERROR,
      message: expect.stringContaining("macOS 키체인에서 apiKey 를 읽지 못했습니다."),
    });
    await expect(runConfig(["get"])).rejects.toMatchObject({
      message: expect.not.stringContaining("설정 파일이 없습니다"),
    });
  });

  it("config get 은 손상된 설정 파일의 이유를 보인다", async () => {
    mocks.getConfig.mockResolvedValue({
      state: "invalid",
      reason: "version 필드는 1이어야 합니다.",
    });

    await expect(runConfig(["get"])).rejects.toMatchObject({
      exitCode: EXIT_CONFIG_ERROR,
      message: expect.stringMatching(/손상[\s\S]*version 필드는 1이어야 합니다/),
    });
  });

  it("config get 은 파일 읽기 실패의 이유를 보인다", async () => {
    mocks.getConfig.mockResolvedValue({
      state: "unreadable",
      reason: "EACCES: permission denied",
    });

    await expect(runConfig(["get"])).rejects.toMatchObject({
      exitCode: EXIT_CONFIG_ERROR,
      message: expect.stringContaining("EACCES"),
    });
  });

  it("config get 에 알 수 없는 키를 주면 EXIT_CONFIG_ERROR 를 던진다", async () => {
    const exit = vi.spyOn(process, "exit");
    mocks.getConfig.mockResolvedValue({
      state: "ok",
      config: { version: 1, apiKey: "api-key-123456", baseUrl: "https://api.dooray.com" },
    });

    await expect(runConfig(["get", "unknown"])).rejects.toMatchObject({
      exitCode: EXIT_CONFIG_ERROR,
      message: expect.stringContaining("알 수 없는 설정 키: unknown"),
    });
    expect(exit).not.toHaveBeenCalled();
  });
});
