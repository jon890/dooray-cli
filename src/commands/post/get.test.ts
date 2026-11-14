import { beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import type { PostDetail } from "@/api/post/types.js";
import { EXIT_API_ERROR } from "../../utils/exit-codes.js";

const mocks = vi.hoisted(() => ({
  getConfigOrThrow: vi.fn(),
  resolvePostInput: vi.fn(),
  attachTagNames: vi.fn(),
  startSpinner: vi.fn(),
  stopSpinner: vi.fn(),
  client: {
    getPost: vi.fn(),
  },
}));

vi.mock("../../config/store.js", () => ({
  getConfigOrThrow: mocks.getConfigOrThrow,
}));

vi.mock("../../api/client.js", () => ({
  DoorayApiClient: vi.fn(function MockDoorayApiClient() {
    return mocks.client;
  }),
}));

vi.mock("../../resolvers/post-input.js", () => ({
  resolvePostInput: mocks.resolvePostInput,
}));

vi.mock("../../resolvers/tag.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../resolvers/tag.js")>();
  return { ...actual, attachTagNames: mocks.attachTagNames };
});

vi.mock("../../utils/spinner.js", () => ({
  startSpinner: mocks.startSpinner,
  stopSpinner: mocks.stopSpinner,
}));

const post: PostDetail = {
  id: "post-1",
  subject: "기존 제목",
  project: { id: "project-1", code: "my-project" },
  taskNumber: "42",
  closed: false,
  createdAt: "2026-08-01T00:00:00Z",
  updatedAt: "2026-08-02T00:00:00Z",
  number: 42,
  priority: "normal",
  dueDate: "2026-08-31T00:00:00Z",
  dueDateFlag: true,
  workflowClass: "working",
  workflow: { id: "workflow-1", name: "진행 중" },
  tags: [{ id: "tag-1" }, { id: "tag-2" }],
  body: { mimeType: "text/x-markdown", content: "기존 본문" },
  users: {
    from: { type: "member", member: { organizationMemberId: "member-from" } },
    to: [],
    cc: [],
  },
  files: [],
  fileIdList: [],
};

async function createCommandTree(): Promise<Command> {
  vi.resetModules();
  const { postGetCommand } = await import("./get.js");
  const program = new Command()
    .name("dooray")
    .option("--json", "JSON 형식으로 출력")
    .option("--quiet", "ID만 출력")
    .option("--no-color", "색상 비활성화");
  const postCommand = new Command("post").description("업무 관련 명령");
  postCommand.addCommand(postGetCommand);
  program.addCommand(postCommand);
  program.exitOverride();
  program.configureOutput({ writeErr: () => {} });
  return program;
}

/** stdout 을 가로채 명령을 돌리고 쓰인 문자열 전부를 돌려준다. */
async function run(args: string[]): Promise<string> {
  const program = await createCommandTree();
  const written: string[] = [];
  const stdout = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    written.push(String(chunk));
    return true;
  });
  try {
    await program.parseAsync(["node", "dooray", "post", "get", ...args]);
  } finally {
    stdout.mockRestore();
  }
  return written.join("");
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getConfigOrThrow.mockResolvedValue({
    apiKey: "test-api-key",
    baseUrl: "https://example.dooray.com",
  });
  mocks.resolvePostInput.mockResolvedValue({
    projectId: "project-1",
    postId: "post-1",
    postNumber: 42,
    projectCode: "my-project",
  });
  mocks.client.getPost.mockResolvedValue({ result: post });
  mocks.attachTagNames.mockResolvedValue({
    tags: [
      { id: "tag-1", name: "긴급" },
      { id: "tag-2", name: "버그" },
    ],
    missing: [],
  });
});

describe("post get 일반 출력의 태그 줄", () => {
  it("이름을 모두 찾으면 태그 줄에 두 이름이 들어간다", async () => {
    const out = await run(["--id", "post-1"]);

    const tagLine = out.split("\n").find((line) => line.startsWith("태그: "));
    expect(tagLine).toBe("태그: 긴급, 버그");
  });

  it("태그가 없는 업무는 태그 줄이 없고 태그 조회도 하지 않는다", async () => {
    mocks.client.getPost.mockResolvedValue({ result: { ...post, tags: [] } });

    const out = await run(["--id", "post-1"]);

    expect(out).not.toContain("태그:");
    expect(mocks.attachTagNames).not.toHaveBeenCalled();
  });

  it("이름을 못 찾은 태그는 (이름 없음) 으로 내고 정상 종료한다", async () => {
    mocks.attachTagNames.mockResolvedValue({
      tags: [{ id: "tag-1", name: "긴급" }, { id: "tag-2" }],
      missing: ["tag-2"],
    });

    const out = await run(["--id", "post-1"]);

    expect(out).toContain("태그: 긴급, tag-2 (이름 없음)");
  });

  it("태그 조회가 실패하면 stderr 에 경고를 내고 정상 종료한다", async () => {
    mocks.attachTagNames.mockRejectedValue(new Error("네트워크 오류"));
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    const out = await run(["--id", "post-1"]);

    expect(stderr).toHaveBeenCalled();
    expect(stderr.mock.calls.map((c) => String(c[0])).join("")).toContain(
      "태그 이름을 불러오지 못했습니다",
    );
    // 이름 없이 진행하므로 태그 줄 자체는 남는다.
    expect(out).toContain("태그: tag-1 (이름 없음)");
    stderr.mockRestore();
  });
});

describe("post get --json 의 태그", () => {
  it("옵션 없는 --json 은 응답을 그대로 내고 태그 조회도 하지 않는다", async () => {
    const out = await run(["--id", "post-1", "--json"]);

    const parsed = JSON.parse(out);
    expect(parsed.tags).toEqual([{ id: "tag-1" }, { id: "tag-2" }]);
    expect(parsed.tags[0]).not.toHaveProperty("name");
    expect(mocks.attachTagNames).not.toHaveBeenCalled();
  });

  it("--with-tag-names 를 주면 각 태그에 name 이 붙는다", async () => {
    const out = await run(["--id", "post-1", "--json", "--with-tag-names"]);

    const parsed = JSON.parse(out);
    expect(parsed.tags).toEqual([
      { id: "tag-1", name: "긴급" },
      { id: "tag-2", name: "버그" },
    ]);
  });

  it("--with-tag-names 로 이름을 못 찾으면 EXIT_API_ERROR 로 던진다", async () => {
    mocks.attachTagNames.mockResolvedValue({
      tags: [{ id: "tag-1", name: "긴급" }, { id: "tag-2" }],
      missing: ["tag-2"],
    });

    await expect(run(["--id", "post-1", "--json", "--with-tag-names"])).rejects.toMatchObject({
      exitCode: EXIT_API_ERROR,
    });
  });
});

describe("post get --with-tag-names 를 --json 없이 준 경우", () => {
  it("무시한다는 경고를 stderr 에 내고 일반 출력을 그대로 낸다", async () => {
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    const out = await run(["--id", "post-1", "--with-tag-names"]);

    expect(stderr.mock.calls.map((c) => String(c[0])).join("")).toContain("--with-tag-names");
    expect(out).toContain("태그: 긴급, 버그");
    stderr.mockRestore();
  });

  it("이름을 못 찾은 태그가 있어도 던지지 않고 (이름 없음) 으로 낸다", async () => {
    mocks.attachTagNames.mockResolvedValue({
      tags: [{ id: "tag-1", name: "긴급" }, { id: "tag-2" }],
      missing: ["tag-2"],
    });
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    const out = await run(["--id", "post-1", "--with-tag-names"]);

    expect(out).toContain("(이름 없음)");
    stderr.mockRestore();
  });

  it("태그 조회가 실패해도 던지지 않고 경고를 낸 뒤 상세를 그대로 낸다", async () => {
    mocks.attachTagNames.mockRejectedValue(new Error("네트워크 오류"));
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    const out = await run(["--id", "post-1", "--with-tag-names"]);

    expect(stderr.mock.calls.map((c) => String(c[0])).join("")).toContain("네트워크 오류");
    expect(out).toContain("#42 기존 제목");
    stderr.mockRestore();
  });
});
