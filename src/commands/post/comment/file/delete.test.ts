import { beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";

const mocks = vi.hoisted(() => ({
  getConfigOrThrow: vi.fn(),
  resolveCommentFileInput: vi.fn(),
  startSpinner: vi.fn(),
  stopSpinner: vi.fn(),
  client: {
    getPostComment: vi.fn(),
    updatePostComment: vi.fn(),
    deletePostFile: vi.fn(),
  },
}));

vi.mock("../../../../config/store.js", () => ({
  getConfigOrThrow: mocks.getConfigOrThrow,
}));

vi.mock("../../../../api/client.js", () => ({
  DoorayApiClient: vi.fn(function MockDoorayApiClient() {
    return mocks.client;
  }),
}));
vi.mock("../../../../api/dooray-client.js", () => ({ createClient: () => mocks.client }));

vi.mock("../../../../resolvers/comment-file-input.js", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("../../../../resolvers/comment-file-input.js")
  >();
  return { ...actual, resolveCommentFileInput: mocks.resolveCommentFileInput };
});

vi.mock("../../../../utils/spinner.js", () => ({
  startSpinner: mocks.startSpinner,
  stopSpinner: mocks.stopSpinner,
}));

async function createCommandTree(): Promise<Command> {
  vi.resetModules();
  const { deleteCommentFileCommand } = await import("./delete.js");
  const program = new Command()
    .name("dooray")
    .option("--json", "JSON 형식으로 출력")
    .option("--quiet", "ID만 출력");
  const postCommand = new Command("post");
  const commentCommand = new Command("comment");
  const fileCommand = new Command("file");
  fileCommand.addCommand(deleteCommentFileCommand);
  commentCommand.addCommand(fileCommand);
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
  mocks.resolveCommentFileInput.mockResolvedValue({
    projectId: "project-1",
    postId: "post-1",
    commentId: "comment-1",
    secondary: "file-1",
  });
  mocks.client.updatePostComment.mockResolvedValue({});
  mocks.client.deletePostFile.mockResolvedValue({});
});

const args = [
  "node",
  "dooray",
  "post",
  "comment",
  "file",
  "delete",
  "--id",
  "post-1",
  "--comment-id",
  "comment-1",
  "--file-id",
  "file-1",
  "-y",
];

it("웹 파일 삭제는 본문 수정에 지울 첨부 ID를 전달한 뒤 파일을 삭제한다", async () => {
  mocks.getConfigOrThrow.mockResolvedValue({ authMode: "web" });
  mocks.client.getPostComment.mockResolvedValue({ result: { body: { mimeType: "text/x-markdown", content: "기존 [파일](/files/file-1)" }, files: [{ id: "file-1" }, { id: "kept-file" }] } });
  const program = await createCommandTree();
  const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  try {
    await program.parseAsync(args);
    expect(mocks.client.updatePostComment.mock.calls[0][4]).toEqual({ removeFileId: "file-1" });
    expect(mocks.client.updatePostComment.mock.invocationCallOrder[0]).toBeLessThan(mocks.client.deletePostFile.mock.invocationCallOrder[0]);
  } finally { stdout.mockRestore(); }
});

describe("post comment file delete mimeType 보존", () => {
  it("text/html 댓글의 reference 제거도 text/html 로 나간다", async () => {
    mocks.client.getPostComment.mockResolvedValue({
      result: { id: "comment-1", body: { mimeType: "text/html", content: "<p>기존</p>\n[x.pdf](/files/file-1)" } },
    });
    const program = await createCommandTree();
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await program.parseAsync(args);

    const request = mocks.client.updatePostComment.mock.calls[0]?.[3];
    expect(request.body.mimeType).toBe("text/html");
    stdout.mockRestore();
  });

  it("markdown 댓글은 그대로 text/x-markdown 으로 나간다", async () => {
    mocks.client.getPostComment.mockResolvedValue({
      result: { id: "comment-1", body: { mimeType: "text/x-markdown", content: "기존\n[x.pdf](/files/file-1)" } },
    });
    const program = await createCommandTree();
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await program.parseAsync(args);

    const request = mocks.client.updatePostComment.mock.calls[0]?.[3];
    expect(request.body.mimeType).toBe("text/x-markdown");
    stdout.mockRestore();
  });
});

describe("post comment file delete mimeType 폴백", () => {
  it("body.mimeType 이 없으면 text/x-markdown 으로 나간다", async () => {
    mocks.client.getPostComment.mockResolvedValue({
      result: { id: "comment-1", body: { content: "기존\n[x.pdf](/files/file-1)" } },
    });
    const program = await createCommandTree();
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await program.parseAsync(args);

    const request = mocks.client.updatePostComment.mock.calls[0]?.[3];
    expect(request.body.mimeType).toBe("text/x-markdown");
    stdout.mockRestore();
  });
});

describe("post comment file delete reference 를 찾지 못했을 때", () => {
  it("파일을 지우지 않고 EXIT_PARAM_ERROR 로 멈춘다", async () => {
    mocks.client.getPostComment.mockResolvedValue({
      result: { id: "comment-1", body: { mimeType: "text/x-markdown", content: "참조 없음" } },
    });
    const program = await createCommandTree();
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await expect(program.parseAsync(args)).rejects.toMatchObject({ exitCode: 3 });

    expect(mocks.client.updatePostComment).not.toHaveBeenCalled();
    expect(mocks.client.deletePostFile).not.toHaveBeenCalled();
    stdout.mockRestore();
  });

  it("찾으면 본문을 갱신하고 파일을 한 번 지운다", async () => {
    mocks.client.getPostComment.mockResolvedValue({
      result: {
        id: "comment-1",
        body: { mimeType: "text/x-markdown", content: "기존\n[x.pdf](/files/file-1)" },
      },
    });
    const program = await createCommandTree();
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await program.parseAsync(args);

    const request = mocks.client.updatePostComment.mock.calls[0]?.[3];
    expect(request.body.content).toBe("기존\n");
    expect(mocks.client.deletePostFile).toHaveBeenCalledOnce();
    stdout.mockRestore();
  });

  it("댓글 조회가 실패하면 스피너를 멈추고 오류를 그대로 낸다", async () => {
    const error = new Error("ECONNRESET");
    mocks.client.getPostComment.mockRejectedValueOnce(error);
    const program = await createCommandTree();
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await expect(program.parseAsync(args)).rejects.toBe(error);

    expect(mocks.stopSpinner).toHaveBeenCalledWith(false, "");
    expect(mocks.client.updatePostComment).not.toHaveBeenCalled();
    expect(mocks.client.deletePostFile).not.toHaveBeenCalled();
    stdout.mockRestore();
  });
});
