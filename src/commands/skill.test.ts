import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { SkillManagerContext } from "../skill/manager.js";

const mocks = vi.hoisted(() => ({
  context: {} as SkillManagerContext,
  confirm: vi.fn(),
  replaceConfig: vi.fn(),
}));

vi.mock("../skill/context.js", () => ({
  createSkillManagerContext: () => mocks.context,
}));
vi.mock("@inquirer/prompts", () => ({
  input: vi.fn().mockResolvedValue("example"),
  select: vi.fn().mockResolvedValue("https://api.dooray.com"),
  password: vi.fn().mockResolvedValue("test-api-key"),
  confirm: mocks.confirm,
}));
vi.mock("../config/store.js", () => ({
  getConfig: vi.fn().mockResolvedValue({ state: "absent" }),
  getConfigOrThrow: vi.fn(),
}));
vi.mock("../services/config.js", () => ({ replaceConfig: mocks.replaceConfig }));
vi.mock("../api/client.js", () => ({
  DoorayApiClient: class {
    async getProjects(): Promise<unknown[]> { return []; }
  },
}));
vi.mock("../resolvers/me.js", () => ({
  ensureMe: vi.fn().mockResolvedValue({ name: "홍길동" }),
}));
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

let root: string;
let output: string[];

beforeEach(async () => {
  vi.clearAllMocks();
  root = await fs.mkdtemp(path.join(tmpdir(), "dooray-skill-command-"));
  mocks.context = {
    homeDir: path.join(root, "home"),
    dataRoot: path.join(root, "data"),
    packageRoot: path.join(root, "package"),
    currentVersion: "1.2.3",
  };
  const source = path.join(mocks.context.packageRoot, "skills", "dooray-cli");
  await fs.mkdir(source, { recursive: true });
  await fs.writeFile(path.join(source, "SKILL.md"), "---\nname: dooray-cli\ndescription: Test skill\n---\n");
  mocks.replaceConfig.mockResolvedValue({ cacheCleared: false });
  output = [];
  vi.spyOn(console, "log").mockImplementation((...values) => {
    output.push(values.join(" "));
  });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(root, { recursive: true, force: true });
});

async function runSkill(args: string[]): Promise<void> {
  vi.resetModules();
  const { skillCommand } = await import("./skill.js");
  await skillCommand.parseAsync(args, { from: "user" });
}

function codexDestination(): string {
  return path.join(mocks.context.homeDir, ".agents", "skills", "dooray-cli");
}

describe("skill commands", () => {
  it("installs both agents and prints their individual destinations", async () => {
    await runSkill(["install"]);

    const codex = await fs.readlink(codexDestination());
    await expect(fs.readlink(path.join(mocks.context.homeDir, ".claude", "skills", "dooray-cli")))
      .resolves.toBe(codex);
    expect(output.join("\n")).toContain("Claude Code·Codex 스킬 설치 완료");
    expect(output).toContain(`설치 경로: ${codexDestination()}`);
  });

  it("reports a missing Codex installation in both JSON and quiet output", async () => {
    await runSkill(["install", "--quiet"]);
    await fs.rm(codexDestination());
    output.length = 0;

    await runSkill(["status", "--quiet"]);
    expect(output).toEqual(["missing"]);
    output.length = 0;
    await runSkill(["status", "--json"]);
    expect(JSON.parse(output[0])).toMatchObject({
      status: "missing",
      agents: { claude: { status: "current" }, codex: { status: "missing" } },
    });
  });

  it("updates both agents and preserves one-token quiet output", async () => {
    await runSkill(["install", "--quiet"]);
    const oldStore = await fs.readlink(codexDestination());
    await fs.writeFile(
      path.join(mocks.context.packageRoot, "skills", "dooray-cli", "SKILL.md"),
      "updated skill\n",
    );
    output.length = 0;

    await runSkill(["update", "--quiet"]);
    expect(output).toEqual(["current"]);
    expect(await fs.readlink(codexDestination())).not.toBe(oldStore);
    output.length = 0;
    await runSkill(["status", "--json"]);
    expect(JSON.parse(output[0]).agents).toMatchObject({
      claude: { status: "current" }, codex: { status: "current" },
    });
  });

  it("returns the Codex backup path in installation JSON", async () => {
    const codex = codexDestination();
    await fs.mkdir(path.dirname(codex), { recursive: true });
    await fs.writeFile(codex, "local edit\n");

    await runSkill(["install", "--force", "--json"]);
    const result = JSON.parse(output[0]);

    expect(result.current.agents.codex.status).toBe("current");
    await expect(fs.readFile(result.backupPaths.codex, "utf8"))
      .resolves.toBe("local edit\n");
  });
});

describe("setup and doctor skill integration", () => {
  it.each([".codex", ".agents"])(
    "offers a shared installation when only %s exists",
    async (directory) => {
      await fs.mkdir(path.join(mocks.context.homeDir, directory), { recursive: true });
      mocks.confirm
        .mockResolvedValueOnce(false) // mail
        .mockResolvedValueOnce(true) // skill
        .mockResolvedValueOnce(false); // feedback
      vi.resetModules();
      const { setupCommand } = await import("./setup.js");

      await setupCommand.parseAsync([], { from: "user" });

      expect(mocks.confirm).toHaveBeenCalledWith(expect.objectContaining({
        message: "Claude Code·Codex 스킬을 설치하시겠습니까?",
      }));
      await expect(fs.readFile(path.join(codexDestination(), "SKILL.md"), "utf8"))
        .resolves.toContain("name: dooray-cli");
      expect(mocks.replaceConfig).toHaveBeenCalled();
    },
  );

  it("includes both installation states in doctor JSON without API configuration", async () => {
    await runSkill(["install", "--quiet"]);
    await fs.rm(codexDestination());
    output.length = 0;
    vi.resetModules();
    const { doctorCommand } = await import("./doctor.js");

    await doctorCommand.parseAsync(["--json"], { from: "user" });

    expect(JSON.parse(output[0])).toMatchObject({
      configState: "absent",
      apiConnection: "skipped",
      skill: {
        status: "missing",
        agents: { claude: { status: "current" }, codex: { status: "missing" } },
      },
    });
  });

  it("shows both agents in doctor text when neither is installed", async () => {
    vi.resetModules();
    const { doctorCommand } = await import("./doctor.js");

    await doctorCommand.parseAsync([], { from: "user" });

    expect(output.join("\n")).toContain("Claude Code:");
    expect(output.join("\n")).toContain("Codex:");
    expect(output.join("\n")).toContain(codexDestination());
  });
});
