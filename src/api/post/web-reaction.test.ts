import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { KyInstance } from "ky";
import { createWebClient } from "../web/index.js";
import { createPublicClient } from "../public/index.js";
import { PublicHttp } from "../public/http.js";
const fixtures = JSON.parse(readFileSync(new URL("../web/fixtures/post/responses.json", import.meta.url), "utf8"));
const api = () => createWebClient("fake-session", "https://example.dooray.com", "https://api.dooray.com");
afterEach(() => vi.unstubAllGlobals());

interface Write { method: string; path: string; body: unknown }
/** 실측한 응답 꼴: 추가는 result 에 reactionId, 삭제는 result 칸이 없다. 실패는 200 과 결과 코드다. */
function server(options: { comment?: unknown; failure?: string } = {}) {
  const writes: Write[] = [];
  vi.stubGlobal("fetch", vi.fn(async (request: Request) => {
    const url = new URL(request.url);
    if (request.method !== "GET") {
      writes.push({ method: request.method, path: url.pathname, body: request.body ? await request.clone().json() : null });
      if (options.failure) return Response.json({ header: { isSuccessful: false, resultCode: -100202, resultMessage: options.failure }, result: null });
      return Response.json(request.method === "POST"
        ? { header: { isSuccessful: true, resultCode: 0, resultMessage: null }, result: { reactionId: "reaction-1", reactionDetailId: "detail-1" } }
        : { header: { isSuccessful: true, resultCode: 0, resultMessage: null } });
    }
    return Response.json(url.pathname.includes("/events/") ? (options.comment ?? fixtures.comment) : fixtures.detail);
  }));
  return writes;
}

describe("웹 댓글 리액션", () => {
  it("추가는 이름을 reactionValue 로 보내고 공식 단위 응답으로 바꾼다", async () => {
    const writes = server();
    expect((await api().addPostCommentReaction("project-1", "post-1", "comment-1", "+1")).result).toBeNull();
    expect(writes).toEqual([{ method: "POST", path: "/wapi/task/v1/tasks/post-1/events/comment-1/reactions", body: { reactionValue: "+1" } }]);
  });
  it("삭제는 이름을 경로 조각으로 인코딩하고 result 없는 성공 응답을 받는다", async () => {
    const writes = server();
    expect((await api().removePostCommentReaction("project-1", "post-1", "comment-1", "+1")).result).toBeNull();
    expect(writes).toEqual([{ method: "DELETE", path: "/wapi/task/v1/tasks/post-1/events/comment-1/reactions/%2B1", body: null }]);
  });
  it("지운 댓글처럼 comment 가 아닌 기록에는 쓰기 전에 코드 3으로 멈춘다", async () => {
    const deleted = structuredClone(fixtures.comment);
    deleted.result.type = "event";
    const writes = server({ comment: deleted });
    await expect(api().addPostCommentReaction("project-1", "post-1", "comment-1", "+1")).rejects.toMatchObject({ exitCode: 3 });
    expect(writes).toEqual([]);
  });
  it("웹이 결과 코드로 거절하면 흔한 원인을 덧붙여 코드 1로 알린다", async () => {
    server({ failure: "중복된 요청입니다." });
    await expect(api().addPostCommentReaction("project-1", "post-1", "comment-1", "+1"))
      .rejects.toMatchObject({ exitCode: 1, message: expect.stringMatching(/^리액션을 달지 못했습니다\. .*대표 이름.*중복된 요청입니다/) });
    await expect(api().removePostCommentReaction("project-1", "post-1", "comment-1", "+1"))
      .rejects.toMatchObject({ exitCode: 1, message: expect.stringMatching(/^리액션을 떼지 못했습니다\./) });
  });
  it("다른 웹 경로는 여전히 result 없는 성공 응답을 구조 오류로 본다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ header: { isSuccessful: true, resultCode: 0, resultMessage: null } })));
    await expect(api().getPost("project-1", "post-1")).rejects.toMatchObject({ exitCode: 1, message: "웹 응답 구조가 올바르지 않습니다." });
  });
});

describe("공개 API 방식의 댓글 리액션", () => {
  it("요청 없이 웹 방식에서만 된다고 코드 3으로 알린다", async () => {
    const http = { get: vi.fn(), post: vi.fn(), delete: vi.fn() };
    const client = createPublicClient(new PublicHttp("key", "https://api.dooray.com", http as unknown as KyInstance));
    await expect(client.addPostCommentReaction("project-1", "post-1", "comment-1", "+1")).rejects.toMatchObject({ exitCode: 3, message: expect.stringContaining("auth-mode web") });
    await expect(client.removePostCommentReaction("project-1", "post-1", "comment-1", "+1")).rejects.toMatchObject({ exitCode: 3 });
    expect(http.post).not.toHaveBeenCalled();
    expect(http.delete).not.toHaveBeenCalled();
  });
});
