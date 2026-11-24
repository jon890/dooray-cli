import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";

const mocks = vi.hoisted(() => ({
  getConfigOrThrow: vi.fn(),
  resolvePostInput: vi.fn(),
  client: { addPostCommentReaction: vi.fn(), removePostCommentReaction: vi.fn() },
}));

vi.mock("../../../config/store.js", () => ({ getConfigOrThrow: mocks.getConfigOrThrow }));
vi.mock("../../../api/dooray-client.js", () => ({ createClient: vi.fn(() => mocks.client) }));
vi.mock("../../../resolvers/post-input.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../resolvers/post-input.js")>();
  return { ...actual, resolvePostInput: mocks.resolvePostInput };
});
vi.mock("../../../utils/spinner.js", () => ({ startSpinner: vi.fn(), stopSpinner: vi.fn(), setQuiet: vi.fn() }));

import { normalizeReactionName, parseReactArgs } from "./react.js";

async function run(...args: string[]): Promise<void> {
  vi.resetModules();
  const { commentReactCommand } = await import("./react.js");
  const program = new Command().name("dooray").option("--json").option("--quiet").exitOverride();
  const post = new Command("post");
  const comment = new Command("comment");
  comment.addCommand(commentReactCommand);
  post.addCommand(comment);
  program.addCommand(post);
  await program.parseAsync(["node", "dooray", ...args]);
}

let stdout: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getConfigOrThrow.mockResolvedValue({ authMode: "web", baseUrl: "https://api.dooray.com" });
  mocks.resolvePostInput.mockResolvedValue({ projectId: "project-1", postId: "post-1" });
  mocks.client.addPostCommentReaction.mockResolvedValue({ result: null });
  mocks.client.removePostCommentReaction.mockResolvedValue({ result: null });
  stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});
afterEach(() => stdout.mockRestore());

describe("normalizeReactionName", () => {
  it("이름과 콜론으로 감싼 이름을 받는다", () => {
    expect(normalizeReactionName("+1")).toBe("+1");
    expect(normalizeReactionName(":white_check_mark:")).toBe("white_check_mark");
    expect(normalizeReactionName("man-gesturing-ok")).toBe("man-gesturing-ok");
  });
  it.each(["👍", "", "two words", "a/b"])("이모지 문자와 이름이 아닌 값은 코드 3으로 거절한다: %s", (raw) => {
    expect(() => normalizeReactionName(raw)).toThrow(expect.objectContaining({ exitCode: 3 }));
  });
});

describe("parseReactArgs", () => {
  it("첫 positional 의 Dooray URL 과 --comment-id 를 받는다", () => {
    expect(parseReactArgs("https://example.dooray.com/project/tasks/1", undefined, undefined, { commentId: "c-1" }))
      .toEqual({ projectArg: "https://example.dooray.com/project/tasks/1", commentId: "c-1" });
  });
  it("URL 만 있고 --comment-id 가 없으면 코드 3", () => {
    expect(() => parseReactArgs("https://example.dooray.com/project/tasks/1", undefined, undefined, {})).toThrow(expect.objectContaining({ exitCode: 3 }));
  });
  it("positional 세 개는 get 과 같게 푼다", () => {
    expect(parseReactArgs("<project>", "42", "c-1", {})).toEqual({ projectArg: "<project>", postNumberArg: "42", commentId: "c-1" });
  });
});

describe("post comment react", () => {
  it("리액션을 달고 결과를 알린다", async () => {
    await run("post", "comment", "react", "<project>", "42", "c-1", "--emoji", "+1");
    expect(mocks.client.addPostCommentReaction).toHaveBeenCalledWith("project-1", "post-1", "c-1", "+1");
    expect(stdout).toHaveBeenCalledWith("리액션을 달았습니다: +1 (댓글 c-1)\n");
  });
  it("--remove 는 떼고 --json 은 상태를 낸다", async () => {
    await run("--json", "post", "comment", "react", "<project>", "42", "c-1", "--emoji", ":+1:", "--remove");
    expect(mocks.client.removePostCommentReaction).toHaveBeenCalledWith("project-1", "post-1", "c-1", "+1");
    expect(mocks.client.addPostCommentReaction).not.toHaveBeenCalled();
    expect(JSON.parse(String(stdout.mock.calls[0][0]))).toEqual({ commentId: "c-1", emoji: "+1", status: "removed" });
  });
  it("--quiet 은 댓글 ID 만 낸다", async () => {
    await run("--quiet", "post", "comment", "react", "<project>", "42", "c-1", "--emoji", "heart");
    expect(stdout).toHaveBeenCalledWith("c-1\n");
  });
  it("공개 API 방식이면 업무를 찾기 전에 코드 3으로 멈춘다", async () => {
    mocks.getConfigOrThrow.mockResolvedValue({ authMode: "api-key", baseUrl: "https://api.dooray.com" });
    await expect(run("post", "comment", "react", "<project>", "42", "c-1", "--emoji", "+1")).rejects.toMatchObject({ exitCode: 3 });
    mocks.getConfigOrThrow.mockResolvedValue({ baseUrl: "https://api.dooray.com" });
    await expect(run("post", "comment", "react", "<project>", "42", "c-1", "--emoji", "+1")).rejects.toMatchObject({ exitCode: 3 });
    expect(mocks.resolvePostInput).not.toHaveBeenCalled();
  });
  it("이모지 문자는 설정을 읽기 전에 거절한다", async () => {
    await expect(run("post", "comment", "react", "<project>", "42", "c-1", "--emoji", "👍")).rejects.toMatchObject({ exitCode: 3 });
    expect(mocks.getConfigOrThrow).not.toHaveBeenCalled();
  });
  it("도움말에 비공식 경로 경고와 이모지 이름 목록이 있다", async () => {
    vi.resetModules();
    const { commentReactCommand } = await import("./react.js");
    let help = "";
    commentReactCommand.configureOutput({ writeOut: (s) => { help += s; } });
    commentReactCommand.outputHelp();
    expect(help.replace(/\s+/g, " ")).toContain("예고 없이 막힐 수 있다");
    expect(help).toMatch(/실측한 이름: \+1, heart/);
  });
});
