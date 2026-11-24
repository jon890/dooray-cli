import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import { readFileSync } from "node:fs";
import { memberCommand } from "@/commands/member/index.js";

const fixtures = JSON.parse(readFileSync(new URL("../../../api/web/fixtures/post/responses.json", import.meta.url), "utf8"));
const webConfig = { authMode: "web", baseUrl: "https://api.dooray.com", tenantName: "my-org", sessionCookie: "fake-session" };

const mocks = vi.hoisted(() => ({
  getConfigOrThrow: vi.fn(),
  getConfig: vi.fn(),
  resolvePostInput: vi.fn(),
}));

vi.mock("../../../config/store.js", () => ({
  getConfigOrThrow: mocks.getConfigOrThrow,
  getConfig: mocks.getConfig,
  warnConfigFileSecurity: vi.fn(),
}));
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
  program.addCommand(memberCommand);
  await program.parseAsync(["node", "dooray", ...args]);
}

let stdout: ReturnType<typeof vi.spyOn>;
const fetchMock = vi.fn<(request: Request) => Promise<Response>>();
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getConfig.mockResolvedValue({ state: "ok", config: webConfig });
  mocks.resolvePostInput.mockResolvedValue({ projectId: "project-1", postId: "post-1" });
  fetchMock.mockReset().mockImplementation(async (request) => {
    if (request.method === "POST") return Response.json({ ...fixtures.comment, result: { reactionId: "reaction-1" } });
    if (request.method === "DELETE") return Response.json({ header: fixtures.comment.header });
    if (request.url.includes("/events/")) {
      return Response.json({ ...fixtures.comment, result: { ...fixtures.comment.result, id: "c-1" } });
    }
    return Response.json(fixtures.detail);
  });
  vi.stubGlobal("fetch", fetchMock);
  stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});
afterEach(() => {
  stdout.mockRestore();
  vi.unstubAllGlobals();
});

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
    expect(fetchMock.mock.lastCall?.[0]).toMatchObject({ method: "POST" });
    expect(stdout).toHaveBeenCalledWith("리액션을 달았습니다: +1 (댓글 c-1)\n");
  });
  it("--remove 는 떼고 --json 은 상태를 낸다", async () => {
    await run("--json", "post", "comment", "react", "<project>", "42", "c-1", "--emoji", ":+1:", "--remove");
    expect(fetchMock.mock.lastCall?.[0]).toMatchObject({ method: "DELETE", url: expect.stringMatching(/\/reactions\/%2B1$/) });
    expect(JSON.parse(String(stdout.mock.calls[0][0]))).toEqual({ commentId: "c-1", emoji: "+1", status: "removed" });
  });
  it("--quiet 은 댓글 ID 만 낸다", async () => {
    await run("--quiet", "post", "comment", "react", "<project>", "42", "c-1", "--emoji", "heart");
    expect(stdout).toHaveBeenCalledWith("c-1\n");
  });
  it.each(["api-key", undefined])("API 키 방식(%s)에서 저장된 세션으로 웹 요청을 보낸다", async (authMode) => {
    mocks.getConfig.mockResolvedValue({ state: "ok", config: { ...webConfig, authMode, apiKey: "fake-key" } });
    await run("post", "comment", "react", "<project>", "42", "c-1", "--emoji", "+1");
    expect(mocks.getConfig).toHaveBeenCalledWith({ sessionOnly: true });
    expect(mocks.resolvePostInput).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ useProjectCache: false }));
    expect(fetchMock.mock.lastCall?.[0]).toMatchObject({
      method: "POST", url: "https://my-org.dooray.com/wapi/task/v1/tasks/post-1/events/c-1/reactions",
    });
    for (const [request] of fetchMock.mock.calls) {
      expect(new URL(request.url).origin).toBe("https://my-org.dooray.com");
      expect(request.headers.get("Cookie")).toBe("SESSION=fake-session");
      expect(request.headers.has("Authorization")).toBe(false);
    }
  });
  it.each(["api-key", undefined])("API 키 방식(%s)에서 쿠키가 없으면 요청 전에 코드 3으로 멈춘다", async (authMode) => {
    mocks.getConfig.mockResolvedValue({ state: "ok", config: { ...webConfig, authMode, sessionCookie: undefined } });
    await expect(run("post", "comment", "react", "<project>", "42", "c-1", "--emoji", "+1")).rejects.toMatchObject({
      exitCode: 3, message: expect.stringContaining("dooray config set session-cookie -"),
    });
    expect(mocks.resolvePostInput).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([
    ["api-key", 401, 3],
    ["api-key", 403, 2],
    ["web", 401, 2],
  ])("%s 방식에서 웹 응답 %i 을 종료 코드 %i 로 알린다", async (authMode, status, exitCode) => {
    mocks.getConfig.mockResolvedValue({ state: "ok", config: { ...webConfig, authMode } });
    fetchMock.mockImplementationOnce(async () => new Response(null, { status }));
    await expect(run("post", "comment", "react", "<project>", "42", "c-1", "--emoji", "+1")).rejects.toMatchObject({
      exitCode, message: expect.stringContaining(status === 401 ? "dooray config set session-cookie -" : "권한이 없습니다"),
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("다른 명령은 저장한 웹 세션이 있어도 API 키로만 요청한다", async () => {
    mocks.getConfigOrThrow.mockResolvedValue({ ...webConfig, authMode: "api-key", apiKey: "fake-key" });
    fetchMock.mockResolvedValueOnce(Response.json({ result: { name: "홍길동" } }));
    await run("--json", "member", "get", "me");
    expect(mocks.getConfig).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = fetchMock.mock.calls[0][0];
    expect(request.url).toBe("https://api.dooray.com/common/v1/members/me");
    expect(request.headers.get("Authorization")).toContain("fake-key");
    expect(request.headers.has("Cookie")).toBe(false);
  });
  it("이모지 문자는 설정을 읽기 전에 거절한다", async () => {
    await expect(run("post", "comment", "react", "<project>", "42", "c-1", "--emoji", "👍")).rejects.toMatchObject({ exitCode: 3 });
    expect(mocks.getConfig).not.toHaveBeenCalled();
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
