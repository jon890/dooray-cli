import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
}));

vi.mock("../config/store.js", () => ({
  getConfig: mocks.getConfig,
  getConfigOrThrow: vi.fn(),
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
vi.mock("../api/client.js", () => ({ DoorayApiClient: class {} }));
vi.mock("../resolvers/me.js", () => ({ ensureMe: vi.fn() }));

let output: string[];

beforeEach(() => {
  vi.clearAllMocks();
  output = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    output.push(args.join(" "));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function runDoctor(): Promise<string> {
  vi.resetModules();
  const { doctorCommand } = await import("./doctor.js");
  await doctorCommand.parseAsync([], { from: "user" });
  return output.join("\n");
}

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
