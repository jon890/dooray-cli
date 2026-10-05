import { beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import type { PostDetail } from "../../api/types.js";
import { DoorayCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";

const mocks = vi.hoisted(() => ({
  getConfigOrThrow: vi.fn(),
  resolvePostInput: vi.fn(),
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

vi.mock("../../utils/spinner.js", () => ({
  startSpinner: mocks.startSpinner,
  stopSpinner: mocks.stopSpinner,
}));

const existingTo = {
  type: "member",
  member: { organizationMemberId: "member-existing-to" },
};
const existingCc = {
  type: "group",
  group: { projectMemberGroupId: "group-existing-cc", members: [] },
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
  priority: "high",
  dueDate: "2026-08-31T00:00:00Z",
  dueDateFlag: true,
  workflowClass: "working",
  workflow: { id: "workflow-1", name: "진행 중" },
  tags: [{ id: "tag-existing", name: "기존 태그" }],
  body: {
    mimeType: "text/x-markdown",
    content: "# 런북\n\n1. 서버 중지\n2. 배포\n3. 서버 시작\n\n![도식](/files/file-1)\n",
  },
  users: {
    from: { type: "member", member: { organizationMemberId: "member-from" } },
    to: [existingTo],
    cc: [existingCc],
  },
  files: [{ id: "file-1", name: "diagram.png", size: 10 }],
  fileIdList: ["file-1"],
};

function exitOverrideAll(cmd: Command): void {
  cmd.exitOverride();
  cmd.configureOutput({ writeErr: () => {} });
  cmd.commands.forEach(exitOverrideAll);
}

async function createCommandTree(): Promise<Command> {
  vi.resetModules();
  const { postReplaceCommand } = await import("./replace.js");
  const program = new Command()
    .name("dooray")
    .option("--json", "JSON 형식으로 출력")
    .option("--quiet", "ID만 출력");
  const postCommand = new Command("post");
  postCommand.addCommand(postReplaceCommand);
  program.addCommand(postCommand);
  exitOverrideAll(program);
  return program;
}

async function run(args: string[]): Promise<{ stdout: string; stderr: string; error?: unknown }> {
  const program = await createCommandTree();
  let stdout = "";
  let stderr = "";
  const out = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    stdout += String(chunk);
    return true;
  });
  const err = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    stderr += String(chunk);
    return true;
  });
  try {
    await program.parseAsync(["node", "dooray", ...args]);
    return { stdout, stderr };
  } catch (error) {
    return { stdout, stderr, error };
  } finally {
    out.mockRestore();
    err.mockRestore();
  }
}

function expectParamError(error: unknown, message: RegExp): void {
  // createCommandTree 가 모듈을 다시 불러 클래스 동일성이 깨지므로 이름으로 판정한다
  expect((error as Error).name).toBe(DoorayCliError.name);
  expect((error as DoorayCliError).exitCode).toBe(EXIT_PARAM_ERROR);
  expect((error as Error).message).toMatch(message);
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
});

describe("post replace", () => {
  it("한 군데를 치환하고 나머지 필드를 보존해 updatePost 를 부른다", async () => {
    const { stdout, error } = await run([
      "post", "replace", "my-project", "42", "--old", "2. 배포", "--new", "2. 카나리 배포",
    ]);

    expect(error).toBeUndefined();
    expect(mocks.client.updatePost).toHaveBeenCalledOnce();
    expect(mocks.client.updatePost).toHaveBeenCalledWith("project-1", "post-1", {
      subject: "기존 제목",
      body: {
        mimeType: "text/x-markdown",
        content: "# 런북\n\n1. 서버 중지\n2. 카나리 배포\n3. 서버 시작\n\n![도식](/files/file-1)\n",
      },
      priority: "high",
      dueDate: "2026-08-31T00:00:00Z",
      dueDateFlag: true,
      users: { to: [existingTo], cc: [existingCc] },
    });
    // tagIds 를 생략해야 서버가 기존 태그를 유지한다 (post edit 과 같은 규칙)
    expect(mocks.client.updatePost.mock.calls[0]?.[2]).not.toHaveProperty("tagIds");
    expect(stdout).toBe("#42 업무 본문에서 1군데를 치환했습니다.\n");
  });

  it("text/html 본문의 mimeType 을 보존한다", async () => {
    mocks.client.getPost.mockResolvedValue({
      result: { ...post, body: { mimeType: "text/html", content: "<p>앞 <mark>형광펜</mark> 뒤</p>" } },
    });

    await run(["post", "replace", "--id", "post-1", "--old", "형광펜", "--new", "강조"]);

    expect(mocks.client.updatePost.mock.calls[0]?.[2].body).toEqual({
      mimeType: "text/html",
      content: "<p>앞 <mark>강조</mark> 뒤</p>",
    });
  });

  it("여러 줄 old·new 를 치환한다", async () => {
    await run([
      "post", "replace", "--id", "post-1",
      "--old", "1. 서버 중지\n2. 배포\n",
      "--new", "1. 공지\n2. 서버 중지\n3. 배포\n",
    ]);

    expect(mocks.client.updatePost.mock.calls[0]?.[2].body.content).toBe(
      "# 런북\n\n1. 공지\n2. 서버 중지\n3. 배포\n3. 서버 시작\n\n![도식](/files/file-1)\n",
    );
  });

  it("일치가 없으면 수정하지 않고 종료 코드 3", async () => {
    const { error } = await run(["post", "replace", "--id", "post-1", "--old", "없는 문장", "--new", "x"]);

    expectParamError(error, /공백과 줄바꿈까지/);
    expect(mocks.client.updatePost).not.toHaveBeenCalled();
  });

  it("2건 이상인데 --all 이 없으면 수정하지 않고 종료 코드 3", async () => {
    const { error } = await run(["post", "replace", "--id", "post-1", "--old", "서버", "--new", "노드"]);

    expectParamError(error, /2군데/);
    expect(mocks.client.updatePost).not.toHaveBeenCalled();
  });

  it("--all 이면 전부 치환하고 개수를 알린다", async () => {
    const { stdout } = await run([
      "post", "replace", "--id", "post-1", "--old", "서버", "--new", "노드", "--all",
    ]);

    expect(mocks.client.updatePost.mock.calls[0]?.[2].body.content).toBe(
      "# 런북\n\n1. 노드 중지\n2. 배포\n3. 노드 시작\n\n![도식](/files/file-1)\n",
    );
    expect(stdout).toContain("2군데");
  });

  it("old 와 new 가 같으면 설정 조회 전에 거부한다", async () => {
    const { error } = await run(["post", "replace", "--id", "post-1", "--old", "배포", "--new", "배포"]);

    expectParamError(error, /같아/);
    expect(mocks.getConfigOrThrow).not.toHaveBeenCalled();
    expect(mocks.client.getPost).not.toHaveBeenCalled();
  });

  it("old 와 new 가 함께 stdin 을 쓰면 설정 조회 전에 거부한다", async () => {
    const { error } = await run(["post", "replace", "--id", "post-1", "--old", "-", "--new-file", "-"]);

    expectParamError(error, /stdin/);
    expect(mocks.getConfigOrThrow).not.toHaveBeenCalled();
  });

  it("--dry-run 은 updatePost 를 부르지 않고 바뀌는 줄만 출력한다", async () => {
    const { stdout } = await run([
      "post", "replace", "--id", "post-1", "--old", "배포", "--new", "카나리 배포", "--dry-run",
    ]);

    expect(mocks.client.updatePost).not.toHaveBeenCalled();
    expect(stdout).toBe("@@ 1/1 — 4번째 줄 @@\n-2. 배포\n+2. 카나리 배포\n1군데가 바뀝니다 (dry-run, 수정하지 않음).\n");
    expect(stdout).not.toContain("# 런북");
  });

  it("--json --dry-run 은 구간과 개수를 구조로 낸다", async () => {
    const { stdout } = await run([
      "--json", "post", "replace", "--id", "post-1", "--old", "배포", "--new", "카나리 배포", "--dry-run",
    ]);

    expect(mocks.client.updatePost).not.toHaveBeenCalled();
    expect(JSON.parse(stdout)).toEqual({
      dryRun: true,
      postId: "post-1",
      replaced: 1,
      mimeType: "text/x-markdown",
      hunks: [{ line: 4, before: "2. 배포", after: "2. 카나리 배포" }],
    });
  });

  it("--dry-run --quiet 은 바뀔 군데 수만 낸다", async () => {
    const { stdout } = await run([
      "--quiet", "post", "replace", "--id", "post-1", "--old", "서버", "--new", "노드", "--all", "--dry-run",
    ]);

    expect(mocks.client.updatePost).not.toHaveBeenCalled();
    expect(stdout).toBe("2\n");
  });

  it("없는 --old-file 은 설정 조회 전에 종료 코드 3", async () => {
    const { error } = await run([
      "post", "replace", "--id", "post-1", "--old-file", "/nonexistent/dir/old.md", "--new", "x",
    ]);

    expectParamError(error, /파일을 찾을 수 없습니다/);
    expect(mocks.getConfigOrThrow).not.toHaveBeenCalled();
  });

  it("--new-file 경로가 비면 old 구간을 지우지 않고 설정 조회 전에 종료 코드 3", async () => {
    const { error } = await run(["post", "replace", "--id", "post-1", "--old", "2. 배포", "--new-file", ""]);

    expectParamError(error, /--new-file 경로가 비어 있습니다/);
    expect(mocks.getConfigOrThrow).not.toHaveBeenCalled();
    expect(mocks.client.updatePost).not.toHaveBeenCalled();
  });

  it("--new-file 로 읽은 내용이 비면 old 구간을 지우지 않고 설정 조회 전에 종료 코드 3", async () => {
    const dir = await mkdtemp(join(tmpdir(), "post-replace-"));
    const empty = join(dir, "new.md");
    await writeFile(empty, "\n");

    const { error } = await run(["post", "replace", "--id", "post-1", "--old", "2. 배포", "--new-file", empty]);

    expectParamError(error, /--new-file 로 읽은 new 가 비어 있습니다/);
    expect(mocks.getConfigOrThrow).not.toHaveBeenCalled();
    expect(mocks.client.updatePost).not.toHaveBeenCalled();
  });

  it("대상 해석이 실패하면 스피너를 띄우지 않는다", async () => {
    mocks.resolvePostInput.mockRejectedValue(new Error("resolve failed"));

    const { error } = await run(["post", "replace", "--id", "post-1", "--old", "배포", "--new", "x"]);

    expect((error as Error).message).toBe("resolve failed");
    expect(mocks.startSpinner).not.toHaveBeenCalled();
  });

  it("업무 조회가 실패하면 스피너를 실패로 멈춘다", async () => {
    mocks.client.getPost.mockRejectedValue(new Error("get failed"));

    const { error } = await run(["post", "replace", "--id", "post-1", "--old", "배포", "--new", "x"]);

    expect((error as Error).message).toBe("get failed");
    expect(mocks.stopSpinner).toHaveBeenCalledWith(false);
    expect(mocks.client.updatePost).not.toHaveBeenCalled();
  });

  it("업무 수정이 실패하면 스피너를 실패로 멈춘다", async () => {
    mocks.client.updatePost.mockRejectedValue(new Error("update failed"));

    const { error } = await run(["post", "replace", "--id", "post-1", "--old", "배포", "--new", "x"]);

    expect((error as Error).message).toBe("update failed");
    expect(mocks.stopSpinner).toHaveBeenLastCalledWith(false);
  });

  it("--json 은 replaced 를 담은 구조를 낸다", async () => {
    const { stdout } = await run([
      "--json", "post", "replace", "--id", "post-1", "--old", "배포", "--new", "카나리 배포",
    ]);

    expect(JSON.parse(stdout)).toEqual({ postId: "post-1", number: 42, replaced: 1 });
  });

  it("--quiet 은 postId 만 낸다", async () => {
    const { stdout } = await run([
      "--quiet", "post", "replace", "--id", "post-1", "--old", "배포", "--new", "카나리 배포",
    ]);

    expect(stdout).toBe("post-1\n");
  });

  describe("첨부 참조 누락", () => {
    const dropArgs = ["post", "replace", "--id", "post-1", "--old", "![도식](/files/file-1)\n", "--new", ""];

    it("non-TTY 에서 --no-confirm 이 없으면 경고하고 수정하지 않는다", async () => {
      const isTTY = process.stdin.isTTY;
      Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });
      try {
        const { error, stderr } = await run(dropArgs);

        expectParamError(error, /--no-confirm/);
        expect(stderr).toContain("/files/file-1");
        expect(stderr).toContain("diagram.png");
        expect(mocks.client.updatePost).not.toHaveBeenCalled();
      } finally {
        Object.defineProperty(process.stdin, "isTTY", { value: isTTY, configurable: true });
      }
    });

    it("--no-confirm 이면 경고만 내고 진행한다", async () => {
      const { error, stderr } = await run([...dropArgs, "--no-confirm"]);

      expect(error).toBeUndefined();
      expect(stderr).toContain("/files/file-1");
      expect(mocks.client.updatePost.mock.calls[0]?.[2].body.content).not.toContain("/files/file-1");
    });

    it("--dry-run 에서는 확인하지 않는다", async () => {
      const { error } = await run([...dropArgs, "--dry-run"]);

      expect(error).toBeUndefined();
      expect(mocks.client.updatePost).not.toHaveBeenCalled();
    });
  });
});
