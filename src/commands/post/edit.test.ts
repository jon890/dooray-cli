import { beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import type { PostDetail } from "@/api/post/types.js";

const mocks = vi.hoisted(() => ({
  getConfigOrThrow: vi.fn(),
  resolvePostInput: vi.fn(),
  ensureMembers: vi.fn(),
  resolveUserAdditions: vi.fn(),
  ensureMe: vi.fn(),
  resolveMember: vi.fn(),
  buildMemberNameMap: vi.fn(),
  resolveTaskLinks: vi.fn(),
  resolvePostRef: vi.fn(),
  openInEditor: vi.fn(),
  readBodyInputOrNull: vi.fn(),
  startSpinner: vi.fn(),
  stopSpinner: vi.fn(),
  client: {
    getPost: vi.fn(),
    getPostStandalone: vi.fn(),
    updatePost: vi.fn(),
    setPostParent: vi.fn(),
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
vi.mock("../../api/dooray-client.js", () => ({ createClient: () => mocks.client }));

vi.mock("../../resolvers/post-input.js", () => ({
  resolvePostInput: mocks.resolvePostInput,
}));

vi.mock("../../resolvers/member.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../resolvers/member.js")>();
  return {
    ...actual,
    ensureMembers: mocks.ensureMembers,
    resolveMember: mocks.resolveMember,
    buildMemberNameMap: mocks.buildMemberNameMap,
  };
});

vi.mock("../../resolvers/me.js", () => ({
  ensureMe: mocks.ensureMe,
}));

vi.mock("../../resolvers/task-link.js", () => ({
  resolveTaskLinks: mocks.resolveTaskLinks,
}));

vi.mock("../../resolvers/postRef.js", () => ({
  resolvePostRef: mocks.resolvePostRef,
}));

vi.mock("../../resolvers/post-users.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../resolvers/post-users.js")>();
  return { ...actual, resolveUserAdditions: mocks.resolveUserAdditions };
});

vi.mock("../../editor/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../editor/index.js")>();
  return { ...actual, openInEditor: mocks.openInEditor };
});

vi.mock("../../utils/body-input.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../utils/body-input.js")>();
  return { ...actual, readBodyInputOrNull: mocks.readBodyInputOrNull };
});

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

const htmlPost: PostDetail = {
  ...post,
  body: { mimeType: "text/html", content: "<p>기존 본문</p>" },
  users: {
    from: { type: "member", member: { organizationMemberId: "member-from" } },
    to: [],
    cc: [],
  },
};

function exitOverrideAll(cmd: Command): void {
  cmd.exitOverride();
  cmd.configureOutput({ writeErr: () => {} });
  cmd.commands.forEach(exitOverrideAll);
}

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
  mocks.ensureMe.mockResolvedValue({ id: "me-1", orgId: "org-1", name: "본인" });
  mocks.resolveMember.mockResolvedValue("member-2");
  mocks.buildMemberNameMap.mockResolvedValue(new Map([["member-2", "홍길동"]]));
  mocks.resolveTaskLinks.mockResolvedValue([
    { projectCode: "my-project", number: 7, postId: "post-7", subject: "다른 업무" },
  ]);
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
      mimeType: "text/x-markdown",
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

describe("post edit mimeType 보존", () => {
  it("비대화형 수정에서 text/html 업무의 mimeType을 유지한다", async () => {
    mocks.client.getPost.mockResolvedValue({ result: htmlPost });
    mocks.readBodyInputOrNull.mockResolvedValue("<p>새 본문</p>");
    const program = await createCommandTree();
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await program.parseAsync([
      "node",
      "dooray",
      "post",
      "edit",
      "--id",
      "post-1",
      "--body",
      "<p>새 본문</p>",
    ]);

    expect(mocks.client.updatePost).toHaveBeenCalledWith(
      "project-1",
      "post-1",
      expect.objectContaining({
        body: { mimeType: "text/html", content: "<p>새 본문</p>" },
      }),
    );
    stdout.mockRestore();
  });

  it("$EDITOR 수정에서 text/html 업무의 mimeType을 유지한다", async () => {
    mocks.client.getPost.mockResolvedValue({ result: htmlPost });
    mocks.openInEditor.mockImplementation(async (original: string) => original + "\n추가");
    const program = await createCommandTree();
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await program.parseAsync(["node", "dooray", "post", "edit", "--id", "post-1"]);

    expect(mocks.openInEditor).toHaveBeenCalledOnce();
    expect(mocks.client.updatePost).toHaveBeenCalledWith(
      "project-1",
      "post-1",
      expect.objectContaining({
        body: { mimeType: "text/html", content: "<p>기존 본문</p>\n추가" },
      }),
    );
    stdout.mockRestore();
  });

  it("markdown 업무는 그대로 text/x-markdown으로 나간다", async () => {
    mocks.readBodyInputOrNull.mockResolvedValue("새 본문");
    const program = await createCommandTree();
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await program.parseAsync([
      "node",
      "dooray",
      "post",
      "edit",
      "--id",
      "post-1",
      "--body",
      "새 본문",
    ]);

    expect(mocks.client.updatePost).toHaveBeenCalledWith(
      "project-1",
      "post-1",
      expect.objectContaining({
        body: { mimeType: "text/x-markdown", content: "새 본문" },
      }),
    );
    stdout.mockRestore();
  });

  it("body.mimeType 이 없으면 text/x-markdown 으로 폴백한다", async () => {
    mocks.client.getPost.mockResolvedValue({
      result: { ...htmlPost, body: { content: "기존 본문" } },
    });
    mocks.readBodyInputOrNull.mockResolvedValue("새 본문");
    const program = await createCommandTree();
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await program.parseAsync([
      "node",
      "dooray",
      "post",
      "edit",
      "--id",
      "post-1",
      "--body",
      "새 본문",
    ]);

    expect(mocks.client.updatePost).toHaveBeenCalledWith(
      "project-1",
      "post-1",
      expect.objectContaining({
        body: { mimeType: "text/x-markdown", content: "새 본문" },
      }),
    );
    stdout.mockRestore();
  });
});

describe("post edit --mime-type", () => {
  it("지정하면 기존 형식 대신 그 값으로 나간다", async () => {
    mocks.client.getPost.mockResolvedValue({ result: htmlPost });
    mocks.readBodyInputOrNull.mockResolvedValue("# 마크다운 본문");
    const program = await createCommandTree();
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await program.parseAsync([
      "node",
      "dooray",
      "post",
      "edit",
      "--id",
      "post-1",
      "--body",
      "# 마크다운 본문",
      "--mime-type",
      "text/x-markdown",
    ]);

    expect(mocks.client.updatePost).toHaveBeenCalledWith(
      "project-1",
      "post-1",
      expect.objectContaining({
        body: { mimeType: "text/x-markdown", content: "# 마크다운 본문" },
      }),
    );
    stdout.mockRestore();
  });

  it("$EDITOR 경로에서 본문을 고치면 지정한 값이 나간다", async () => {
    mocks.client.getPost.mockResolvedValue({ result: htmlPost });
    mocks.openInEditor.mockImplementation(async (original: string) => original + "\n추가");
    const program = await createCommandTree();
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await program.parseAsync([
      "node",
      "dooray",
      "post",
      "edit",
      "--id",
      "post-1",
      "--body",
      "새 본문",
      "--mime-type",
      "text/x-markdown",
    ]);

    const request = mocks.client.updatePost.mock.calls[0]?.[2];
    expect(request.body.mimeType).toBe("text/x-markdown");
    stdout.mockRestore();
  });

  it("본문을 바꾸지 않고 형식만 바꾸면 stderr 로 경고한다", async () => {
    mocks.client.getPost.mockResolvedValue({ result: htmlPost });
    mocks.readBodyInputOrNull.mockResolvedValue(null);
  mocks.ensureMe.mockResolvedValue({ id: "me-1", orgId: "org-1", name: "본인" });
  mocks.resolveMember.mockResolvedValue("member-2");
  mocks.buildMemberNameMap.mockResolvedValue(new Map([["member-2", "홍길동"]]));
  mocks.resolveTaskLinks.mockResolvedValue([
    { projectCode: "my-project", number: 7, postId: "post-7", subject: "다른 업무" },
  ]);
    const program = await createCommandTree();
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    let stderrOutput = "";
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderrOutput += String(chunk);
      return true;
    });

    await program.parseAsync([
      "node",
      "dooray",
      "post",
      "edit",
      "--id",
      "post-1",
      "--mime-type",
      "text/x-markdown",
    ]);

    expect(stderrOutput).toContain("본문을 변환하지 않으므로");
    stdout.mockRestore();
    stderr.mockRestore();
  });

  it("본문을 함께 바꾸면 경고하지 않는다", async () => {
    mocks.client.getPost.mockResolvedValue({ result: htmlPost });
    mocks.readBodyInputOrNull.mockResolvedValue("# 마크다운 본문");
    const program = await createCommandTree();
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    let stderrOutput = "";
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderrOutput += String(chunk);
      return true;
    });

    await program.parseAsync([
      "node",
      "dooray",
      "post",
      "edit",
      "--id",
      "post-1",
      "--body",
      "# 마크다운 본문",
      "--mime-type",
      "text/x-markdown",
    ]);

    expect(stderrOutput).toBe("");
    stdout.mockRestore();
    stderr.mockRestore();
  });

  it("단독 지정하면 $EDITOR 없이 기존 본문을 그대로 두고 형식만 바꾼다", async () => {
    mocks.client.getPost.mockResolvedValue({ result: htmlPost });
    mocks.readBodyInputOrNull.mockResolvedValue(null);
  mocks.ensureMe.mockResolvedValue({ id: "me-1", orgId: "org-1", name: "본인" });
  mocks.resolveMember.mockResolvedValue("member-2");
  mocks.buildMemberNameMap.mockResolvedValue(new Map([["member-2", "홍길동"]]));
  mocks.resolveTaskLinks.mockResolvedValue([
    { projectCode: "my-project", number: 7, postId: "post-7", subject: "다른 업무" },
  ]);
    const program = await createCommandTree();
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await program.parseAsync([
      "node",
      "dooray",
      "post",
      "edit",
      "--id",
      "post-1",
      "--mime-type",
      "text/x-markdown",
    ]);

    expect(mocks.openInEditor).not.toHaveBeenCalled();
    const request = mocks.client.updatePost.mock.calls[0]?.[2];
    expect(request.body).toEqual({
      mimeType: "text/x-markdown",
      content: "<p>기존 본문</p>",
    });
    stdout.mockRestore();
  });

  it("--dry-run 미리보기에 지정한 형식이 나온다", async () => {
    mocks.client.getPost.mockResolvedValue({ result: htmlPost });
    mocks.readBodyInputOrNull.mockResolvedValue("<p>새 본문</p>");
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
      "--body",
      "<p>새 본문</p>",
      "--mime-type",
      "text/html",
      "--dry-run",
    ]);

    expect(JSON.parse(output).mimeType).toBe("text/html");
    expect(mocks.client.updatePost).not.toHaveBeenCalled();
    stdout.mockRestore();
  });

  it("허용하지 않는 값이면 Commander 가 거부한다", async () => {
    const program = await createCommandTree();
    exitOverrideAll(program);

    await expect(
      program.parseAsync([
        "node",
        "dooray",
        "post",
        "edit",
        "--id",
        "post-1",
        "--mime-type",
        "markdown",
      ]),
    ).rejects.toThrow(/Allowed choices/);
    expect(mocks.client.updatePost).not.toHaveBeenCalled();
  });
});

describe("post edit 제목 옵션", () => {
  it("제거된 --subject 는 알 수 없는 옵션으로 거절한다", async () => {
    const program = await createCommandTree();
    exitOverrideAll(program);

    await expect(
      program.parseAsync(["node", "dooray", "post", "edit", "--id", "post-1", "--subject", "새 제목"]),
    ).rejects.toThrow(/unknown option '--subject'/);
    expect(mocks.client.updatePost).not.toHaveBeenCalled();
  });
});

describe("post edit 멘션·링크·상위 업무 단독 호출", () => {
  const baseArgs = ["node", "dooray", "post", "edit", "--id", "post-1"];

  it("--mention 만 주면 편집기 없이 멘션을 붙여 수정한다", async () => {
    const program = await createCommandTree();
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await program.parseAsync([...baseArgs, "--mention", "홍길동"]);

    expect(mocks.openInEditor).not.toHaveBeenCalled();
    expect(mocks.client.updatePost).toHaveBeenCalledWith(
      "project-1",
      "post-1",
      expect.objectContaining({
        body: {
          mimeType: "text/x-markdown",
          content: '[@홍길동](dooray://org-1/members/member-2 "member") 기존 본문',
        },
      }),
    );
    stdout.mockRestore();
  });

  it("--link-task 만 주면 편집기 없이 수정한다", async () => {
    const program = await createCommandTree();
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await program.parseAsync([...baseArgs, "--link-task", "my-project/7"]);

    expect(mocks.openInEditor).not.toHaveBeenCalled();
    expect(mocks.client.updatePost).toHaveBeenCalledOnce();
    stdout.mockRestore();
  });

  it("--parent 만 주면 편집기 없이 상위 업무를 바꾼다", async () => {
    mocks.resolvePostRef.mockResolvedValue("post-parent");
    mocks.client.setPostParent.mockResolvedValue({});
    const program = await createCommandTree();
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await program.parseAsync([...baseArgs, "--parent", "my-project/1"]);

    expect(mocks.openInEditor).not.toHaveBeenCalled();
    expect(mocks.client.setPostParent).toHaveBeenCalledWith("project-1", "post-1", "post-parent");
    stdout.mockRestore();
  });
});

describe("웹 상위 업무의 사전 확인", () => {
  it("다른 프로젝트의 상위를 지정하면 본문을 수정하기 전에 멈춘다", async () => {
    mocks.getConfigOrThrow.mockResolvedValue({ authMode: "web" });
    mocks.resolvePostRef.mockResolvedValue("post-parent");
    mocks.client.getPostStandalone.mockResolvedValue({ result: { project: { id: "other-project" } } });
    const program = await createCommandTree();
    await expect(program.parseAsync(["node", "dooray", "post", "edit", "--id", "post-1", "--body", "수정", "--parent", "sample/1"])).rejects.toMatchObject({ exitCode: 3 });
    expect(mocks.client.updatePost).not.toHaveBeenCalled();
    expect(mocks.client.setPostParent).not.toHaveBeenCalled();
    expect(mocks.stopSpinner).toHaveBeenCalledWith(false);
  });
  it("같은 프로젝트의 상위는 먼저 확인한 ID로 변경한다", async () => {
    mocks.getConfigOrThrow.mockResolvedValue({ authMode: "web" });
    mocks.resolvePostRef.mockResolvedValue("post-parent");
    mocks.client.getPostStandalone.mockResolvedValue({ result: { project: { id: "project-1" } } });
    const program = await createCommandTree();
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      await program.parseAsync(["node", "dooray", "post", "edit", "--id", "post-1", "--parent", "sample/1"]);
      expect(mocks.client.updatePost).toHaveBeenCalledOnce();
      expect(mocks.client.setPostParent).toHaveBeenCalledWith("project-1", "post-1", "post-parent");
      expect(mocks.resolvePostRef).toHaveBeenCalledTimes(1);
    } finally { stdout.mockRestore(); }
  });
});

describe("post edit --dry-run 은 편집기를 열지 않는다", () => {
  const baseArgs = ["node", "dooray", "post", "edit", "--id", "post-1"];

  it.each([
    ["--mention", ["--mention", "홍길동"], '[@홍길동](dooray://org-1/members/member-2 "member") 기존 본문'],
    ["--link-task", ["--link-task", "my-project/7"], "기존 본문"],
    ["옵션 없음", [], "기존 본문"],
  ])("%s: 합성한 본문만 출력하고 수정하지 않는다", async (_label, args, expected) => {
    const program = await createCommandTree();
    let output = "";
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      output += String(chunk);
      return true;
    });
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    await program.parseAsync([...baseArgs, ...args, "--dry-run"]);

    expect(output).toContain(expected);
    expect(output).not.toContain("업무가 수정되었습니다");
    expect(mocks.openInEditor).not.toHaveBeenCalled();
    expect(mocks.client.updatePost).not.toHaveBeenCalled();
    stdout.mockRestore();
    stderr.mockRestore();
  });
});

describe("post edit 본문 형식별 마크업", () => {
  const baseArgs = ["node", "dooray", "post", "edit", "--id", "post-1"];

  it("마크다운 본문의 멘션은 종전 문자열을 본문 앞에 붙인다", async () => {
    const program = await createCommandTree();
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    await program.parseAsync([
      ...baseArgs, "--mime-type", "text/x-markdown", "--mention", "홍길동",
    ]);

    expect(mocks.client.updatePost).toHaveBeenCalledWith(
      "project-1",
      "post-1",
      expect.objectContaining({
        body: {
          mimeType: "text/x-markdown",
          content: '[@홍길동](dooray://org-1/members/member-2 "member") 기존 본문',
        },
      }),
    );
    stdout.mockRestore();
    stderr.mockRestore();
  });

  it("HTML 본문의 멘션은 표기가 없어 EXIT_PARAM_ERROR 로 거절한다", async () => {
    mocks.client.getPost.mockResolvedValue({ result: htmlPost });
    const program = await createCommandTree();
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    await expect(
      program.parseAsync([...baseArgs, "--mime-type", "text/html", "--mention", "홍길동"]),
    ).rejects.toMatchObject({ exitCode: 3 });

    expect(mocks.client.updatePost).not.toHaveBeenCalled();
    stdout.mockRestore();
    stderr.mockRestore();
  });

  it("HTML 본문의 업무 링크도 같은 종료 코드로 거절한다", async () => {
    mocks.client.getPost.mockResolvedValue({ result: htmlPost });
    const program = await createCommandTree();
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    await expect(
      program.parseAsync([
        ...baseArgs, "--mime-type", "text/html", "--link-task", "my-project/7",
      ]),
    ).rejects.toMatchObject({ exitCode: 3 });

    expect(mocks.client.updatePost).not.toHaveBeenCalled();
    stdout.mockRestore();
    stderr.mockRestore();
  });

  it("거절은 멤버와 업무를 해석하기 전에 한다", async () => {
    mocks.client.getPost.mockResolvedValue({ result: htmlPost });
    const program = await createCommandTree();
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    await expect(
      program.parseAsync([
        ...baseArgs,
        "--mime-type", "text/html",
        "--mention", "홍길동",
        "--link-task", "my-project/7",
      ]),
    ).rejects.toMatchObject({ exitCode: 3 });

    expect(mocks.resolveMember).not.toHaveBeenCalled();
    expect(mocks.resolveTaskLinks).not.toHaveBeenCalled();
    stdout.mockRestore();
    stderr.mockRestore();
  });
});


describe("편집기에서 일정 상태 보존", () => {
  it.each([
    ["web", true, true],
    ["web", false, false],
    ["api-key", true, false],
  ])("%s에서 날짜를 바꾸지 않으면 일정 여부 %s를 보낸다", async (authMode, previousFlag, expectedFlag) => {
    mocks.getConfigOrThrow.mockResolvedValue({ authMode });
    mocks.client.getPost.mockResolvedValue({ result: { ...htmlPost, dueDate: null, dueDateFlag: previousFlag } });
    mocks.openInEditor.mockImplementation(async (original: string) => original.replace("기존 제목", "편집한 제목"));
    const program = await createCommandTree();
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      await program.parseAsync(["node", "dooray", "post", "edit", "--id", "post-1"]);
      expect(mocks.client.updatePost).toHaveBeenCalledWith("project-1", "post-1", expect.objectContaining({
        subject: "편집한 제목", dueDateFlag: expectedFlag,
      }));
    } finally { stdout.mockRestore(); }
  });
});
