import { beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import { EXIT_PARAM_ERROR } from "../../../utils/exit-codes.js";

const mocks = vi.hoisted(() => ({
  getConfigOrThrow: vi.fn(),
  resolvePostInput: vi.fn(),
  readBodyInputOrNull: vi.fn(),
  openInEditor: vi.fn(),
  ensureMe: vi.fn(),
  resolveMember: vi.fn(),
  buildMemberNameMap: vi.fn(),
  resolveTaskLinks: vi.fn(),
  startSpinner: vi.fn(),
  stopSpinner: vi.fn(),
  client: {
    createPostComment: vi.fn(),
  },
}));

vi.mock("../../../config/store.js", () => ({
  getConfigOrThrow: mocks.getConfigOrThrow,
}));

vi.mock("../../../api/client.js", () => ({
  DoorayApiClient: vi.fn(function MockDoorayApiClient() {
    return mocks.client;
  }),
}));

vi.mock("../../../resolvers/post-input.js", () => ({
  resolvePostInput: mocks.resolvePostInput,
}));

vi.mock("@/body/body-input.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/body/body-input.js")>();
  return { ...actual, readBodyInputOrNull: mocks.readBodyInputOrNull };
});

vi.mock("../../../editor/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../editor/index.js")>();
  return { ...actual, openInEditor: mocks.openInEditor };
});

vi.mock("../../../resolvers/me.js", () => ({
  ensureMe: mocks.ensureMe,
}));

vi.mock("../../../resolvers/member.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../resolvers/member.js")>();
  return {
    ...actual,
    resolveMember: mocks.resolveMember,
    buildMemberNameMap: mocks.buildMemberNameMap,
  };
});

vi.mock("../../../resolvers/task-link.js", () => ({
  resolveTaskLinks: mocks.resolveTaskLinks,
}));

vi.mock("../../../utils/spinner.js", () => ({
  startSpinner: mocks.startSpinner,
  stopSpinner: mocks.stopSpinner,
}));


async function createCommandTree(): Promise<Command> {
  vi.resetModules();
  const { commentAddCommand } = await import("./add.js");
  const program = new Command()
    .name("dooray")
    .option("--json", "JSON 형식으로 출력")
    .option("--quiet", "ID만 출력");
  const postCommand = new Command("post");
  const commentCommand = new Command("comment");
  commentCommand.addCommand(commentAddCommand);
  postCommand.addCommand(commentCommand);
  program.addCommand(postCommand);
  return program;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getConfigOrThrow.mockResolvedValue({ apiKey: "k", baseUrl: "https://example.dooray.com" });
  mocks.resolvePostInput.mockResolvedValue({
    projectId: "project-1",
    postId: "post-1",
    postNumber: 42,
    projectCode: "my-project",
  });
  mocks.client.createPostComment.mockResolvedValue({ result: { id: "comment-1" } });
  mocks.readBodyInputOrNull.mockResolvedValue("새 댓글");
});

async function run(...args: string[]): Promise<string> {
  const program = await createCommandTree();
  const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  try {
    await program.parseAsync(["node", "dooray", ...args]);
    return stdout.mock.calls.map((c) => String(c[0])).join("");
  } finally {
    stdout.mockRestore();
  }
}

const base = ["post", "comment", "add", "--id", "post-1"];

describe("post comment add 출력", () => {
  it("--json 은 API 응답 result 를 그대로 낸다 (명령 앞에 둔 경우)", async () => {
    const out = await run("--json", ...base, "--body", "새 댓글");
    expect(JSON.parse(out)).toEqual({ id: "comment-1" });
  });

  it("--json 은 명령 뒤에 둬도 같다", async () => {
    const out = await run(...base, "--body", "새 댓글", "--json");
    expect(JSON.parse(out)).toEqual({ id: "comment-1" });
  });

  it("--quiet 은 댓글 id 만 낸다", async () => {
    const out = await run(...base, "--body", "새 댓글", "--quiet");
    expect(out).toBe("comment-1\n");
  });

  it("정상 등록은 본문을 그대로 보낸다", async () => {
    await run(...base, "--body", "새 댓글");
    expect(mocks.client.createPostComment).toHaveBeenCalledWith("project-1", "post-1", {
      body: { mimeType: "text/x-markdown", content: "새 댓글" },
    });
  });
});

describe("post comment add 빈 본문 거부", () => {
  it.each([["빈 문자열", ""], ["공백뿐", "  \n\t "]])("%s 는 API 를 부르지 않고 EXIT_PARAM_ERROR 로 끝난다", async (_n, text) => {
    mocks.readBodyInputOrNull.mockResolvedValue(text);
    await expect(run(...base, "--body", text)).rejects.toMatchObject({
      exitCode: EXIT_PARAM_ERROR,
    });
    expect(mocks.client.createPostComment).not.toHaveBeenCalled();
    expect(mocks.resolvePostInput).not.toHaveBeenCalled();
  });

  it("$EDITOR 가 빈 본문을 돌려줘도 거부한다", async () => {
    mocks.readBodyInputOrNull.mockResolvedValue(null);
    mocks.openInEditor.mockResolvedValue("  \n");
    await expect(run(...base)).rejects.toMatchObject({ exitCode: EXIT_PARAM_ERROR });
    expect(mocks.client.createPostComment).not.toHaveBeenCalled();
  });
});
