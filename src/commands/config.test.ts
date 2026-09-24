import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DoorayCliError } from "../utils/errors.js";
import { EXIT_CONFIG_ERROR, EXIT_PARAM_ERROR } from "../utils/exit-codes.js";

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
  updateConfigValue: vi.fn(),
}));

vi.mock("../config/store.js", () => ({ getConfig: mocks.getConfig }));
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
