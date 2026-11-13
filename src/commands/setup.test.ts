import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EXIT_CONFIG_ERROR } from "../utils/exit-codes.js";

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
  input: vi.fn(),
  select: vi.fn(),
  password: vi.fn(),
  confirm: vi.fn(),
  getMe: vi.fn(),
  getProjects: vi.fn(),
  replaceConfig: vi.fn(),
}));

vi.mock("../config/store.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config/store.js")>();
  return { ...actual, getConfig: mocks.getConfig };
});
vi.mock("@inquirer/prompts", () => ({
  input: mocks.input,
  select: mocks.select,
  password: mocks.password,
  confirm: mocks.confirm,
}));
vi.mock("../services/config.js", () => ({ replaceConfig: mocks.replaceConfig }));
vi.mock("../api/dooray-client.js", () => ({ createClient: () => ({ getMe: mocks.getMe, getProjects: mocks.getProjects }) }));
vi.mock("../resolvers/me.js", () => ({ ensureMe: async () => ({ name: "홍길동" }) }));
vi.mock("../skill/context.js", () => ({ createSkillManagerContext: () => ({ homeDir: "/nonexistent-agent-home" }) }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.input.mockReset(); mocks.select.mockReset(); mocks.password.mockReset(); mocks.confirm.mockReset(); mocks.getMe.mockReset();
  mocks.replaceConfig.mockResolvedValue({ cacheCleared: false });
  mocks.getMe.mockResolvedValue({ result: { name: "홍길동" } });
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(process.stderr, "write").mockReturnValue(true);
});
afterEach(() => vi.restoreAllMocks());

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

describe("setup 웹 인증", () => {
  const existing = { version: 1, apiKey: "fake-api-key", baseUrl: "https://api.dooray.com", tenantName: "my-org" };
  function webInputs() {
    mocks.getConfig.mockResolvedValue({ state: "ok", config: existing });
    mocks.select.mockResolvedValueOnce("web").mockResolvedValueOnce(existing.baseUrl);
    mocks.input.mockResolvedValue("my-org");
    mocks.password.mockResolvedValue("SESSION=fake-session");
    mocks.confirm.mockResolvedValue(false);
  }
  it("첫 방식 질문 뒤 가린 쿠키를 받고 다른 방식의 API 키를 보존한다", async () => {
    webInputs(); await runSetup();
    expect(mocks.select.mock.calls[0][0].message).toContain("인증 방식");
    expect(mocks.password.mock.calls[0][0].mask).toBe("*");
    expect(mocks.input.mock.calls[0][0]).not.toHaveProperty("default");
    expect(mocks.replaceConfig).toHaveBeenCalledWith(expect.objectContaining({ apiKey: "fake-api-key", authMode: "web", sessionCookie: "fake-session" }));
    expect(process.stderr.write).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain("fake-session");
  });
  it("형식 오류면 API 호출 전에 쿠키를 다시 묻는다", async () => {
    webInputs(); mocks.password.mockReset().mockResolvedValueOnce("a=1; b=2").mockResolvedValueOnce("fake-session");
    await runSetup();
    expect(mocks.password).toHaveBeenCalledTimes(2);
    expect(mocks.getMe).toHaveBeenCalledTimes(1);
  });
  it("만료 오류면 쿠키만 다시 묻는다", async () => {
    webInputs();
    mocks.getMe.mockImplementationOnce(async () => {
      const { DoorayCliError } = await import("../utils/errors.js");
      throw new DoorayCliError("SESSION 쿠키를 다시 넣으세요", 2);
    });
    await runSetup();
    expect(mocks.password).toHaveBeenCalledTimes(2);
    expect(mocks.input).toHaveBeenCalledTimes(1);
  });
  it("잘못된 테넌트면 쿠키를 받기 전에 테넌트를 다시 묻는다", async () => {
    webInputs(); mocks.input.mockReset().mockResolvedValueOnce("my-org/other").mockResolvedValueOnce("my-org");
    await runSetup();
    expect(mocks.input).toHaveBeenCalledTimes(2);
    expect(mocks.password).toHaveBeenCalledTimes(1);
  });
  it("권한 오류면 재질문하거나 저장하지 않고 끝낸다", async () => {
    webInputs(); mocks.getMe.mockImplementationOnce(async () => {
      const { DoorayCliError } = await import("../utils/errors.js");
      throw new DoorayCliError("이 계정에는 권한이 없습니다", 2);
    });
    await expect(runSetup()).rejects.toMatchObject({ exitCode: 2, message: expect.stringContaining("권한") });
    expect(mocks.password).toHaveBeenCalledTimes(1);
    expect(mocks.replaceConfig).not.toHaveBeenCalled();
  });
  it("API 방식으로 돌아가도 기존 쿠키를 지우지 않는다", async () => {
    mocks.getConfig.mockResolvedValue({ state: "ok", config: { ...existing, authMode: "web", sessionCookie: "fake-old-session" } });
    mocks.select.mockResolvedValueOnce("api-key").mockResolvedValueOnce(existing.baseUrl);
    mocks.input.mockResolvedValue("my-org"); mocks.password.mockResolvedValue("fake-new-key"); mocks.confirm.mockResolvedValue(false);
    await runSetup();
    expect(mocks.replaceConfig).toHaveBeenCalledWith(expect.objectContaining({ authMode: "api-key", apiKey: "fake-new-key", sessionCookie: "fake-old-session" }));
    expect(process.stderr.write).not.toHaveBeenCalled();
  });
});
