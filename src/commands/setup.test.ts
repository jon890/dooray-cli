import { beforeEach, describe, expect, it, vi } from "vitest";
import { EXIT_CONFIG_ERROR } from "../utils/exit-codes.js";

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
  input: vi.fn(),
}));

vi.mock("../config/store.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config/store.js")>();
  return { ...actual, getConfig: mocks.getConfig };
});
vi.mock("@inquirer/prompts", () => ({
  input: mocks.input,
  select: vi.fn(),
  password: vi.fn(),
  confirm: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

async function runSetup(): Promise<void> {
  vi.resetModules();
  const { setupCommand } = await import("./setup.js");
  await setupCommand.parseAsync([], { from: "user" });
}

describe("setup 키체인 읽기 실패", () => {
  it("키체인을 읽지 못하면 질문을 시작하기 전에 키체인 오류로 끝난다", async () => {
    mocks.getConfig.mockResolvedValue({
      state: "unreadable",
      reason: "macOS 키체인에서 apiKey 를 읽지 못했습니다.",
      source: "keychain",
    });

    const error = await runSetup().catch((err: unknown) => err);

    // resetModules 로 다시 불러온 모듈의 클래스라 instanceof 대신 이름과 종료 코드로 본다.
    expect((error as Error).name).toBe("DoorayCliError");
    expect((error as { exitCode: number }).exitCode).toBe(EXIT_CONFIG_ERROR);
    expect((error as Error).message).toContain("macOS 키체인에서 apiKey 를 읽지 못했습니다.");
    expect(mocks.input).not.toHaveBeenCalled();
  });
});
