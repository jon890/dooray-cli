import { beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";

const mocks = vi.hoisted(() => ({
  getConfigOrThrow: vi.fn(),
  resolvePostInput: vi.fn(),
  readBodyInputOrNull: vi.fn(),
  openInEditor: vi.fn(),
  checkAndGuardDropped: vi.fn(),
  ensureMe: vi.fn(),
  resolveMember: vi.fn(),
  buildMemberNameMap: vi.fn(),
  resolveTaskLinks: vi.fn(),
  startSpinner: vi.fn(),
  stopSpinner: vi.fn(),
  client: {
    getPostComment: vi.fn(),
    getPostComments: vi.fn(),
    updatePostComment: vi.fn(),
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

vi.mock("../../../utils/body-input.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../utils/body-input.js")>();
  return { ...actual, readBodyInputOrNull: mocks.readBodyInputOrNull };
});

vi.mock("../../../editor/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../editor/index.js")>();
  return { ...actual, openInEditor: mocks.openInEditor };
});

vi.mock("../../../utils/attachment-check.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../utils/attachment-check.js")>();
  return { ...actual, checkAndGuardDropped: mocks.checkAndGuardDropped };
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

function comment(mimeType: string) {
  return {
    id: "comment-1",
    body: { mimeType, content: "기존 댓글" },
    files: [],
  };
}

function exitOverrideAll(cmd: Command): void {
  cmd.exitOverride();
  cmd.configureOutput({ writeErr: () => {} });
  cmd.commands.forEach(exitOverrideAll);
}

async function createCommandTree(): Promise<Command> {
  vi.resetModules();
  const { commentEditCommand } = await import("./edit.js");
  const program = new Command()
    .name("dooray")
    .option("--json", "JSON 형식으로 출력")
    .option("--quiet", "ID만 출력");
  const postCommand = new Command("post");
  const commentCommand = new Command("comment");
  commentCommand.addCommand(commentEditCommand);
  postCommand.addCommand(commentCommand);
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
  mocks.client.updatePostComment.mockResolvedValue({});
  mocks.checkAndGuardDropped.mockResolvedValue(undefined);
  mocks.readBodyInputOrNull.mockResolvedValue("수정된 댓글");
  mocks.ensureMe.mockResolvedValue({ id: "me-1", orgId: "org-1", name: "본인" });
  mocks.resolveMember.mockResolvedValue("member-2");
  mocks.buildMemberNameMap.mockResolvedValue(new Map([["member-2", "홍길동"]]));
  mocks.resolveTaskLinks.mockResolvedValue([
    { projectCode: "my-project", number: 7, postId: "post-7", subject: "다른 업무" },
  ]);
});

describe("post comment edit mimeType 보존", () => {
  it("text/html 댓글을 수정해도 text/html 로 나간다", async () => {
    mocks.client.getPostComment.mockResolvedValue({ result: comment("text/html") });
    const program = await createCommandTree();
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await program.parseAsync([
      "node",
      "dooray",
      "post",
      "comment",
      "edit",
      "--id",
      "post-1",
      "--comment-id",
      "comment-1",
      "--body",
      "수정된 댓글",
    ]);

    expect(mocks.client.updatePostComment).toHaveBeenCalledWith(
      "project-1",
      "post-1",
      "comment-1",
      { body: { mimeType: "text/html", content: "수정된 댓글" } },
    );
    stdout.mockRestore();
  });

  it("markdown 댓글은 그대로 text/x-markdown 으로 나간다", async () => {
    mocks.client.getPostComment.mockResolvedValue({ result: comment("text/x-markdown") });
    const program = await createCommandTree();
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await program.parseAsync([
      "node",
      "dooray",
      "post",
      "comment",
      "edit",
      "--id",
      "post-1",
      "--comment-id",
      "comment-1",
      "--body",
      "수정된 댓글",
    ]);

    expect(mocks.client.updatePostComment).toHaveBeenCalledWith(
      "project-1",
      "post-1",
      "comment-1",
      { body: { mimeType: "text/x-markdown", content: "수정된 댓글" } },
    );
    stdout.mockRestore();
  });
});

describe("post comment edit --mime-type", () => {
  const baseArgs = [
    "node",
    "dooray",
    "post",
    "comment",
    "edit",
    "--id",
    "post-1",
    "--comment-id",
    "comment-1",
  ];

  it("지정하면 기존 형식 대신 그 값으로 나간다", async () => {
    mocks.client.getPostComment.mockResolvedValue({ result: comment("text/html") });
    const program = await createCommandTree();
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await program.parseAsync([...baseArgs, "--body", "수정된 댓글", "--mime-type", "text/x-markdown"]);

    expect(mocks.client.updatePostComment).toHaveBeenCalledWith(
      "project-1",
      "post-1",
      "comment-1",
      { body: { mimeType: "text/x-markdown", content: "수정된 댓글" } },
    );
    stdout.mockRestore();
  });

  it("단독 지정하면 $EDITOR 없이 기존 본문을 그대로 두고 형식만 바꾼다", async () => {
    mocks.client.getPostComment.mockResolvedValue({ result: comment("text/html") });
    mocks.readBodyInputOrNull.mockResolvedValue(null);
    const program = await createCommandTree();
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await program.parseAsync([...baseArgs, "--mime-type", "text/x-markdown"]);

    expect(mocks.openInEditor).not.toHaveBeenCalled();
    expect(mocks.client.updatePostComment).toHaveBeenCalledWith(
      "project-1",
      "post-1",
      "comment-1",
      { body: { mimeType: "text/x-markdown", content: "기존 댓글" } },
    );
    stdout.mockRestore();
  });

  it("--dry-run 미리보기에 지정한 형식이 나온다", async () => {
    mocks.client.getPostComment.mockResolvedValue({ result: comment("text/x-markdown") });
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
      "comment",
      "edit",
      "--id",
      "post-1",
      "--comment-id",
      "comment-1",
      "--body",
      "<p>수정된 댓글</p>",
      "--mime-type",
      "text/html",
      "--dry-run",
    ]);

    expect(JSON.parse(output).mimeType).toBe("text/html");
    expect(mocks.client.updatePostComment).not.toHaveBeenCalled();
    stdout.mockRestore();
  });

  it("허용하지 않는 값이면 Commander 가 거부한다", async () => {
    mocks.client.getPostComment.mockResolvedValue({ result: comment("text/html") });
    const program = await createCommandTree();
    exitOverrideAll(program);

    await expect(
      program.parseAsync([...baseArgs, "--body", "수정된 댓글", "--mime-type", "html"]),
    ).rejects.toThrow(/Allowed choices/);
    expect(mocks.client.updatePostComment).not.toHaveBeenCalled();
  });
});

describe("post comment edit mimeType 폴백", () => {
  it("body.mimeType 이 없으면 text/x-markdown 으로 나간다", async () => {
    mocks.client.getPostComment.mockResolvedValue({
      result: { id: "comment-1", body: { content: "기존 댓글" }, files: [] },
    });
    const program = await createCommandTree();
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await program.parseAsync([
      "node",
      "dooray",
      "post",
      "comment",
      "edit",
      "--id",
      "post-1",
      "--comment-id",
      "comment-1",
      "--body",
      "수정된 댓글",
    ]);

    expect(mocks.client.updatePostComment).toHaveBeenCalledWith(
      "project-1",
      "post-1",
      "comment-1",
      { body: { mimeType: "text/x-markdown", content: "수정된 댓글" } },
    );
    stdout.mockRestore();
  });
});

describe("post comment edit 본문 형식별 마크업", () => {
  const baseArgs = [
    "node", "dooray", "post", "comment", "edit",
    "--id", "post-1", "--comment-id", "comment-1", "--body", "수정된 댓글",
  ];

  it("마크다운 댓글의 멘션은 종전 문자열을 본문 앞에 붙인다", async () => {
    mocks.client.getPostComment.mockResolvedValue({ result: comment("text/x-markdown") });
    const program = await createCommandTree();
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await program.parseAsync([...baseArgs, "--mention", "홍길동"]);

    expect(mocks.client.updatePostComment).toHaveBeenCalledWith(
      "project-1",
      "post-1",
      "comment-1",
      {
        body: {
          mimeType: "text/x-markdown",
          content: '[@홍길동](dooray://org-1/members/member-2 "member") 수정된 댓글',
        },
      },
    );
    stdout.mockRestore();
  });

  it("HTML 댓글의 멘션은 표기가 없어 EXIT_PARAM_ERROR 로 거절한다", async () => {
    mocks.client.getPostComment.mockResolvedValue({ result: comment("text/html") });
    const program = await createCommandTree();
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await expect(
      program.parseAsync([...baseArgs, "--mention", "홍길동"]),
    ).rejects.toMatchObject({ exitCode: 3 });

    expect(mocks.client.updatePostComment).not.toHaveBeenCalled();
    stdout.mockRestore();
  });

  it("HTML 댓글의 업무 링크도 같은 종료 코드로 거절한다", async () => {
    mocks.client.getPostComment.mockResolvedValue({ result: comment("text/html") });
    const program = await createCommandTree();
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await expect(
      program.parseAsync([...baseArgs, "--link-task", "my-project/7"]),
    ).rejects.toMatchObject({ exitCode: 3 });

    expect(mocks.client.updatePostComment).not.toHaveBeenCalled();
    stdout.mockRestore();
  });

  it("거절은 멤버와 업무를 해석하기 전에 한다", async () => {
    mocks.client.getPostComment.mockResolvedValue({ result: comment("text/html") });
    const program = await createCommandTree();
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await expect(
      program.parseAsync([...baseArgs, "--mention", "홍길동", "--link-task", "my-project/7"]),
    ).rejects.toMatchObject({ exitCode: 3 });

    expect(mocks.resolveMember).not.toHaveBeenCalled();
    expect(mocks.resolveTaskLinks).not.toHaveBeenCalled();
    stdout.mockRestore();
  });
});

describe("post comment edit 댓글 조회", () => {
  const baseArgs = [
    "node", "dooray", "post", "comment", "edit",
    "--id", "post-1", "--comment-id", "comment-99", "--body", "수정된 댓글",
  ];

  it("목록의 첫 페이지가 아니라 댓글 ID 로 단건 조회한다", async () => {
    mocks.client.getPostComment.mockResolvedValue({
      result: { ...comment("text/x-markdown"), id: "comment-99" },
    });
    const program = await createCommandTree();
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await program.parseAsync(baseArgs);

    expect(mocks.client.getPostComment).toHaveBeenCalledWith("project-1", "post-1", "comment-99");
    expect(mocks.client.getPostComments).not.toHaveBeenCalled();
    expect(mocks.client.updatePostComment).toHaveBeenCalledWith(
      "project-1",
      "post-1",
      "comment-99",
      { body: { mimeType: "text/x-markdown", content: "수정된 댓글" } },
    );
    stdout.mockRestore();
  });

  it("단건 조회의 API 오류는 종료 코드를 유지한 채 전역 핸들러로 넘긴다", async () => {
    const { DoorayCliError } = await import("../../../utils/errors.js");
    mocks.client.getPostComment.mockRejectedValue(
      new DoorayCliError("API 호출 실패: 댓글이 없습니다", 1),
    );
    const program = await createCommandTree();
    const exit = vi.spyOn(process, "exit");

    await expect(program.parseAsync(baseArgs)).rejects.toMatchObject({
      name: "DoorayCliError",
      exitCode: 1,
    });
    expect(exit).not.toHaveBeenCalled();
    expect(mocks.stopSpinner).toHaveBeenCalledWith(false);
    expect(mocks.client.updatePostComment).not.toHaveBeenCalled();
    exit.mockRestore();
  });

  it("응답에 댓글이 없으면 process.exit 대신 DoorayCliError 를 던진다", async () => {
    mocks.client.getPostComment.mockResolvedValue({ result: null });
    const program = await createCommandTree();
    const exit = vi.spyOn(process, "exit");

    await expect(program.parseAsync(baseArgs)).rejects.toMatchObject({
      name: "DoorayCliError",
      exitCode: 1,
      message: expect.stringContaining("comment-99"),
    });
    expect(exit).not.toHaveBeenCalled();
    expect(mocks.client.updatePostComment).not.toHaveBeenCalled();
    exit.mockRestore();
  });
});
