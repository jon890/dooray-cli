import { beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import type { PostDetail } from "../../api/types.js";

const mocks = vi.hoisted(() => ({
  getConfigOrThrow: vi.fn(),
  resolvePostInput: vi.fn(),
  ensureMembers: vi.fn(),
  resolveUserAdditions: vi.fn(),
  openInEditor: vi.fn(),
  readBodyInputOrNull: vi.fn(),
  startSpinner: vi.fn(),
  stopSpinner: vi.fn(),
  client: {
    getPost: vi.fn(),
    updatePost: vi.fn(),
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

vi.mock("../../resolvers/member.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../resolvers/member.js")>();
  return { ...actual, ensureMembers: mocks.ensureMembers };
});

vi.mock("../../resolvers/post-users.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../resolvers/post-users.js")>();
  return { ...actual, resolveUserAdditions: mocks.resolveUserAdditions };
});

vi.mock("../../editor/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../editor/index.js")>();
  return { ...actual, openInEditor: mocks.openInEditor };
});

vi.mock("../../utils/body-input.js", () => ({
  readBodyInputOrNull: mocks.readBodyInputOrNull,
}));

vi.mock("../../utils/spinner.js", () => ({
  startSpinner: mocks.startSpinner,
  stopSpinner: mocks.stopSpinner,
}));

const existingTo = {
  type: "member",
  member: { organizationMemberId: "member-existing-to" },
};
const existingCc = {
  type: "member",
  member: { organizationMemberId: "member-existing-cc" },
};
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
  tags: [{ id: "tag-existing", name: "기존 태그" }],
  body: { mimeType: "text/x-markdown", content: "기존 본문" },
  users: {
    from: { type: "member", member: { organizationMemberId: "member-from" } },
    to: [existingTo],
    cc: [existingCc],
  },
  files: [],
  fileIdList: [],
};

async function createCommandTree(): Promise<Command> {
  vi.resetModules();
  const { postEditCommand } = await import("./edit.js");
  const program = new Command()
    .name("dooray")
    .option("--json", "JSON 형식으로 출력")
    .option("--quiet", "ID만 출력")
    .option("--no-color", "색상 비활성화");
  const postCommand = new Command("post").description("업무 관련 명령");
  postCommand.addCommand(postEditCommand);
  program.addCommand(postCommand);
  return program;
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
  mocks.client.updatePost.mockResolvedValue({});
  mocks.ensureMembers.mockResolvedValue([]);
  mocks.readBodyInputOrNull.mockResolvedValue(null);
  mocks.resolveUserAdditions.mockImplementation(
    async (_client, _projectId, names: string[], groupCodes: string[]) => [
      ...names.map((name) => ({
        type: "member",
        member: { organizationMemberId: `member-${name}` },
      })),
      ...groupCodes.map((code) => ({
        type: "group",
        group: { projectMemberGroupId: `group-${code}`, members: [] },
      })),
    ],
  );
});

describe("post edit 참여자 단독 호출", () => {
  it.each([
    ["--cc", ["--cc", "홍길동"]],
    ["--cc-group", ["--cc-group", "qa-team"]],
    ["--cc-clear", ["--cc-clear"]],
    ["--to", ["--to", "김철수"]],
    ["--to-group", ["--to-group", "qa-team"]],
    ["--to-clear", ["--to-clear"]],
  ])("%s 옵션만으로 편집기 없이 수정한다", async (_option, args) => {
    const program = await createCommandTree();
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await program.parseAsync(["node", "dooray", "post", "edit", "--id", "post-1", ...args]);

    expect(mocks.openInEditor).not.toHaveBeenCalled();
    expect(mocks.client.updatePost).toHaveBeenCalledOnce();
    stdout.mockRestore();
  });

  it("참여자만 바꾸면 기존 제목·본문·태그를 보존한다", async () => {
    const program = await createCommandTree();
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await program.parseAsync([
      "node",
      "dooray",
      "post",
      "edit",
      "--id",
      "post-1",
      "--cc-group",
      "qa-team",
    ]);

    expect(mocks.client.updatePost).toHaveBeenCalledWith(
      "project-1",
      "post-1",
      expect.objectContaining({
        subject: "기존 제목",
        body: { mimeType: "text/x-markdown", content: "기존 본문" },
        users: {
          to: [existingTo],
          cc: [
            existingCc,
            {
              type: "group",
              group: { projectMemberGroupId: "group-qa-team", members: [] },
            },
          ],
        },
      }),
    );
    const request = mocks.client.updatePost.mock.calls[0]?.[2];
    expect(request).not.toHaveProperty("tagIds");
    expect(mocks.openInEditor).not.toHaveBeenCalled();
    stdout.mockRestore();
  });

  it("상위 --json과 참여자 dry-run을 조합해 users 미리보기를 출력한다", async () => {
    const program = await createCommandTree();
    let output = "";
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      output += String(chunk);
      return true;
    });

    await program.parseAsync([
      "node",
      "dooray",
      "--json",
      "post",
      "edit",
      "--id",
      "post-1",
      "--cc-group",
      "qa-team",
      "--dry-run",
    ]);

    expect(JSON.parse(output)).toEqual({
      body: "기존 본문",
      users: {
        to: [existingTo],
        cc: [
          existingCc,
          {
            type: "group",
            group: { projectMemberGroupId: "group-qa-team", members: [] },
          },
        ],
      },
    });
    expect(mocks.openInEditor).not.toHaveBeenCalled();
    expect(mocks.client.updatePost).not.toHaveBeenCalled();
    stdout.mockRestore();
  });
});
