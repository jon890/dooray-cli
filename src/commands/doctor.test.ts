import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
  getConfigOrThrow: vi.fn(),
  readConfigFileSecurity: vi.fn(),
  getProjects: vi.fn(),
  getMe: vi.fn(),
  ensureMe: vi.fn(),
}));

vi.mock("../config/store.js", () => ({
  getConfig: mocks.getConfig,
  getConfigOrThrow: mocks.getConfigOrThrow,
  readConfigFileSecurity: mocks.readConfigFileSecurity,
}));
vi.mock("../skill/context.js", () => ({
  createSkillManagerContext: () => ({}),
}));
vi.mock("../skill/manager.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../skill/manager.js")>();
  const missing = { status: "missing", destination: "/skills", linkTarget: null };
  return {
    ...actual,
    inspectSkill: vi.fn().mockResolvedValue({
      status: "missing",
      agents: { claude: missing, codex: missing },
    }),
  };
});
vi.mock("../cache/store.js", () => ({
  getCacheStats: vi.fn().mockResolvedValue({
    me: null,
    projectCount: 0,
    memberProjectCount: 0,
    workflowProjectCount: 0,
    tagProjectCount: 0,
    milestoneProjectCount: 0,
    memberGroupProjectCount: 0,
  }),
}));
vi.mock("../api/dooray-client.js", () => ({ createClient: () => ({ getMe: mocks.getMe }) }));
vi.mock("../resolvers/me.js", () => ({ ensureMe: mocks.ensureMe }));

let output: string[];
const originalExitCode = process.exitCode;
const validConfig = { version: 1, apiKey: "dummy-key", baseUrl: "https://api.dooray.com" };

beforeEach(() => {
  vi.clearAllMocks();
  process.exitCode = undefined;
  mocks.readConfigFileSecurity.mockResolvedValue([]);
  mocks.getConfigOrThrow.mockResolvedValue(validConfig);
  mocks.getProjects.mockResolvedValue([]);
  mocks.getMe.mockResolvedValue({ result: { name: "홍길동" } });
  mocks.ensureMe.mockResolvedValue({ name: "홍길동" });
  output = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    output.push(args.join(" "));
  });
});

afterEach(() => {
  process.exitCode = originalExitCode;
  vi.restoreAllMocks();
});

async function runDoctor(args: string[] = []): Promise<string> {
  vi.resetModules();
  const { doctorCommand } = await import("./doctor.js");
  await doctorCommand.parseAsync(args, { from: "user" });
  return output.join("\n");
}

describe("doctor --json 설정 읽기 실패 출처", () => {
  it("키체인 읽기 실패는 source 가 keychain 이다", async () => {
    mocks.getConfig.mockResolvedValue({
      state: "unreadable",
      reason: "macOS 키체인에서 apiKey 를 읽지 못했습니다.",
      source: "keychain",
    });

    const payload = JSON.parse(await runDoctor(["--json"]));

    expect(payload.configState).toBe("unreadable");
    expect(payload.source).toBe("keychain");
  });

  it("파일 읽기 실패는 source 가 file 이다", async () => {
    mocks.getConfig.mockResolvedValue({
      state: "unreadable",
      reason: "EACCES: permission denied",
    });

    const payload = JSON.parse(await runDoctor(["--json"]));

    expect(payload.source).toBe("file");
  });

  it("읽기 실패가 아니면 source 를 넣지 않는다", async () => {
    mocks.getConfig.mockResolvedValue({ state: "absent" });

    const payload = JSON.parse(await runDoctor(["--json"]));

    expect(payload).not.toHaveProperty("source");
  });
});

describe("doctor 설정 읽기 실패 표시", () => {
  it("키체인 읽기 실패는 설정 파일이 아니라 키체인 실패로 보인다", async () => {
    mocks.getConfig.mockResolvedValue({
      state: "unreadable",
      reason: "macOS 키체인에서 apiKey 를 읽지 못했습니다.",
      source: "keychain",
    });

    const text = await runDoctor();

    expect(text).toContain("키체인:");
    expect(text).toContain("macOS 키체인에서 apiKey 를 읽지 못했습니다.");
    expect(text).toContain("키체인에서 설정의 비밀값을 읽지 못했습니다.");
    expect(text).not.toContain("설정 파일:");
    expect(text).not.toContain("파일 권한을 확인하세요.");
    expect(text).not.toContain("설정 파일을 읽지 못했습니다.");
  });

  it("파일 읽기 실패는 기존처럼 파일 권한을 안내한다", async () => {
    mocks.getConfig.mockResolvedValue({
      state: "unreadable",
      reason: "EACCES: permission denied",
    });

    const text = await runDoctor();

    expect(text).toContain("설정 파일:");
    expect(text).toContain("파일 권한을 확인하세요.");
    expect(text).toContain("설정 파일을 읽지 못했습니다.");
  });
});

describe("doctor 항목별 결과와 종료 코드", () => {
  it("웹 방식은 API 키 없이 완료하고 캐시 대신 getMe 를 직접 부른다", async () => {
    mocks.getConfig.mockResolvedValue({ state: "ok", config: { ...validConfig, apiKey: "", authMode: "web", tenantName: "my-org", sessionCookie: "fake-session" } });
    const payload = JSON.parse(await runDoctor(["--json"]));
    expect(payload).toMatchObject({ authMode: "web", apiKeyOk: false, apiConnection: "ok" });
    expect(payload.checks).toContainEqual(expect.objectContaining({ id: "auth-mode", status: "warn" }));
    expect(payload.checks).toContainEqual(expect.objectContaining({ id: "session-cookie", status: "pass" }));
    expect(payload.checks).not.toContainEqual(expect.objectContaining({ id: "api-key" }));
    expect(mocks.getMe).toHaveBeenCalledTimes(1);
    expect(mocks.ensureMe).not.toHaveBeenCalled();
    expect(JSON.stringify(payload)).not.toContain("fake-session");
    expect(process.exitCode).toBe(0);
  });
  it("웹 만료 안내를 JSON 과 텍스트에 보이고 진단은 실패로 끝낸다", async () => {
    mocks.getConfig.mockResolvedValue({ state: "ok", config: { ...validConfig, apiKey: "", authMode: "web", tenantName: "my-org", sessionCookie: "fake-session" } });
    mocks.getMe.mockRejectedValue(new Error("SESSION 쿠키를 config set session-cookie - 로 다시 넣으세요"));
    const payload = JSON.parse(await runDoctor(["--json"]));
    expect(payload.apiConnection).toBe("failed");
    expect(payload.checks).toContainEqual(expect.objectContaining({ id: "api-connection", message: expect.stringContaining("config set session-cookie -") }));
    expect(await runDoctor()).toContain("config set session-cookie -");
    expect(process.exitCode).toBe(1);
  });
  it.each([
    { state: "absent" },
    { state: "invalid", reason: "invalid JSON" },
    { state: "unreadable", reason: "EACCES" },
  ])("%j 는 설정 실패만 넣고 연결과 보안은 검사하지 않는다", async (config) => {
    mocks.getConfig.mockResolvedValue(config);
    const payload = JSON.parse(await runDoctor(["--json"]));
    expect(payload.checks).toEqual([expect.objectContaining({ id: "config", status: "fail" })]);
    expect(payload.apiConnection).toBe("skipped");
    expect(mocks.readConfigFileSecurity).not.toHaveBeenCalled();
    expect(mocks.getProjects).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    if (config.state === "absent") expect(payload.checks[0].fix).toBe("dooray setup");
  });

  it("키체인 읽기 실패여도 파일 보안은 검사한다", async () => {
    mocks.getConfig.mockResolvedValue({ state: "unreadable", source: "keychain", reason: "locked" });
    mocks.readConfigFileSecurity.mockResolvedValue([
      { kind: "plaintext-secret", status: "fail", message: "평문 비밀값", fix: "dooray config set track-last-run false" },
    ]);
    const payload = JSON.parse(await runDoctor(["--json"]));
    expect(payload.checks).toEqual([
      expect.objectContaining({ id: "config", status: "fail" }),
      expect.objectContaining({ id: "config-file-security", status: "fail" }),
    ]);
    expect(process.exitCode).toBe(1);
  });

  it.each(["apiKey", "baseUrl"])("%s 미설정이면 해당 항목만 실패하고 연결은 생략한다", async (key) => {
    mocks.getConfig.mockResolvedValue({ state: "ok", config: { ...validConfig, [key]: "" } });
    const payload = JSON.parse(await runDoctor(["--json"]));
    expect(payload.checks.filter((c: { status: string }) => c.status === "fail"))
      .toEqual([expect.objectContaining({ id: key === "apiKey" ? "api-key" : "base-url" })]);
    expect(payload.apiConnection).toBe("skipped");
    expect(process.exitCode).toBe(1);
  });

  it("연결 실패를 JSON 과 텍스트 모두 실패로 센다", async () => {
    mocks.getConfig.mockResolvedValue({ state: "ok", config: validConfig });
    mocks.getMe.mockRejectedValue(new Error("connection failed"));
    const payload = JSON.parse(await runDoctor(["--json"]));
    expect(payload.apiConnection).toBe("failed");
    expect(payload.checks).toContainEqual(expect.objectContaining({ id: "api-connection", status: "fail" }));
    expect(process.exitCode).toBe(1);
    output = [];
    expect(await runDoctor()).toContain("❌ 실패");
    expect(process.exitCode).toBe(1);
  });

  it("보안 실패와 고치는 명령을 JSON 과 텍스트로 보이며 stderr 경고를 끈다", async () => {
    mocks.getConfig.mockResolvedValue({ state: "ok", config: validConfig });
    const fix = "dooray config set track-last-run true";
    mocks.readConfigFileSecurity.mockResolvedValue([
      { kind: "plaintext-secret", status: "fail", message: "apiKey 평문 비밀값", fix },
      { kind: "wide-permission", status: "fail", message: "config.json 권한 0600 필요", fix },
      { kind: "plaintext-unstorable", status: "warn", message: "키체인에 옮길 수 없어 평문으로 남은 값" },
    ]);
    const payload = JSON.parse(await runDoctor(["--json"]));
    expect(payload.checks).toContainEqual(expect.objectContaining({ id: "config-file-security", status: "fail", fix }));
    expect(payload.apiKeyOk).toBe(true);
    expect(payload.baseUrlOk).toBe(true);
    expect(payload.configState).toBe("ok");
    expect(payload.apiConnection).toBe("ok");
    expect(payload.skill.status).toBe("missing");
    expect(process.exitCode).toBe(1);
    output = [];
    const text = await runDoctor();
    expect(text).toContain("🔐 보안");
    expect(text).toContain("❌ apiKey 평문 비밀값");
    expect(text).toContain(fix);
    expect(text.match(/dooray config set track-last-run true/g)).toHaveLength(1);
    expect(text).toContain("다시 저장하면 비밀값이 키체인으로 옮겨지고 파일 권한이 0600 이 됩니다.");
    expect(text).toContain("⚠️ 키체인에 옮길 수 없어 평문으로 남은 값");
    expect(mocks.getConfigOrThrow.mock.calls.every(([opts]) => opts.securityWarning === false)).toBe(true);
    expect(process.exitCode).toBe(1);
  });

  it.each(["plaintext-no-store", "plaintext-unstorable"])("%s 경고만 있으면 종료 코드 0 이다", async (kind) => {
    mocks.getConfig.mockResolvedValue({ state: "ok", config: validConfig });
    mocks.readConfigFileSecurity.mockResolvedValue([{ kind, status: "warn", message: "평문 저장 경고" }]);
    const payload = JSON.parse(await runDoctor(["--json"]));
    expect(payload.checks).toContainEqual(expect.objectContaining({ id: "config-file-security", status: "warn" }));
    expect(payload.checks.every((c: { status: string }) => c.status !== "fail")).toBe(true);
    expect(process.exitCode).toBe(0);
  });

  it("스킬 미설치만 있으면 checks 에 넣지 않고 성공으로 끝난다", async () => {
    mocks.getConfig.mockResolvedValue({ state: "ok", config: validConfig });
    const payload = JSON.parse(await runDoctor(["--json"]));
    expect(payload.skill.status).toBe("missing");
    expect(payload.checks.every((c: { status: string }) => c.status === "pass")).toBe(true);
    expect(payload.checks.map((c: { id: string }) => c.id)).not.toContain("skill");
    expect(process.exitCode).toBe(0);
    output = [];
    expect(await runDoctor()).toContain("❌ 미설치");
    expect(process.exitCode).toBe(0);
  });
});


it("텍스트 진단은 연결 응답을 기다리기 전에 설정과 보안을 보여 준다", async () => {
  mocks.getConfig.mockResolvedValue({ state: "ok", config: validConfig });
  mocks.getMe.mockImplementationOnce(async () => {
    const shown = output.join("\n");
    expect(shown).toContain("Dooray CLI 진단");
    expect(shown).toContain("API Key:");
    expect(shown).toContain("🔐 보안");
    expect(shown).toContain("API 연결 테스트");
    expect(shown).not.toContain("✅ 성공");
    return { result: { name: "홍길동" } };
  });
  expect(await runDoctor()).toContain("✅ 성공");
  expect(process.exitCode).toBe(0);
});
