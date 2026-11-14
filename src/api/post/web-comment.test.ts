import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createWebClient } from "../web/index.js";
const fixtures = JSON.parse(readFileSync(new URL("../web/fixtures/post/responses.json", import.meta.url), "utf8"));
const api = () => createWebClient("fake-session", "https://example.dooray.com", "https://api.dooray.com");
afterEach(() => vi.unstubAllGlobals());
function server(commentResponse = fixtures.comment) {
  const writes: any[] = [], queries: URL[] = [];
  const newer = commentResponse.result;
  const older = { ...newer, id: "comment-0", createdAt: "2026-01-02T04:05:06+09:00" };
  vi.stubGlobal("fetch", vi.fn(async (request: Request) => {
    const url = new URL(request.url);
    if (request.method !== "GET") {
      writes.push(request.body ? await request.clone().json() : null);
      return Response.json(request.method === "POST" ? fixtures.created : fixtures.unit);
    }
    if (url.pathname.endsWith("/events")) {
      queries.push(url);
      return Response.json({ ...fixtures.comments, totalCount: 2, result: [url.searchParams.has("baseEventId") ? older : newer] });
    }
    return Response.json(url.pathname.endsWith("/files") ? fixtures.files : url.pathname.includes("/events/") ? commentResponse : fixtures.detail);
  }));
  return { writes, queries };
}
describe("웹 댓글 페이지와 수정", () => {
  it("최신 페이지는 한 번만 읽고 다음 페이지에서 커서를 보낸다", async () => {
    const { queries } = server(), client = api();
    expect((await client.getPostComments("project-1", "post-1", { size: 1, order: "-createdAt" })).result.map(c => c.id)).toEqual(["comment-1"]);
    expect(queries).toHaveLength(1);
    expect((await client.getPostComments("project-1", "post-1", { size: 1, page: 1, order: "-createdAt" })).result.map(c => c.id)).toEqual(["comment-0"]);
    expect(queries[1].searchParams.get("baseEventId")).toBe("comment-1");
    expect(queries[1].searchParams.get("direction")).toBe("<");
    expect(queries[1].searchParams.has("page")).toBe(false);
  });
  it("오름차순은 끝까지 읽은 뒤 정렬하고 페이지를 자른다", async () => {
    server(); const client = api();
    const result = await client.getPostComments("project-1", "post-1", { size: 1, order: "createdAt" });
    expect(result.result.map(c => c.id)).toEqual(["comment-0"]);
    expect(result.totalCount).toBe(2);
    expect(result.result[0]).not.toHaveProperty("internalKey");
  });
  it("알 수 없는 작성자 종류는 파라미터 오류 대신 응답 형식 오류로 알린다", async () => {
    const response = structuredClone(fixtures.comments);
    response.result[0].creator = fixtures.unknownCreator;
    vi.stubGlobal("fetch", vi.fn(async (request: Request) => Response.json(new URL(request.url).pathname.endsWith("/events") ? response : fixtures.detail)));
    await expect(api().getPostComments("project-1", "post-1", { order: "-createdAt" })).rejects.toMatchObject({ exitCode: 1 });
  });
  it("같은 페이지가 반복되면 무한 조회 대신 실패한다", async () => {
    vi.stubGlobal("fetch", vi.fn(async (request: Request) => Response.json(new URL(request.url).pathname.endsWith("/events") ? { ...fixtures.comments, totalCount: 5 } : fixtures.detail)));
    await expect(api().getPostComments("project-1", "post-1")).rejects.toMatchObject({ exitCode: 1 });
  });
  it("본문 수정은 단건 첨부 ID를 유지하고 파일 참조 삭제 때는 해당 ID만 뺀다", async () => {
    const { writes } = server(), client = api();
    await client.updatePostComment("project-1", "post-1", "comment-1", { body: { mimeType: "text/x-markdown", content: "수정 [파일](/files/file-1)" } });
    expect(writes[0].fileIdList).toEqual(["file-1"]);
    await client.updatePostComment("project-1", "post-1", "comment-1", { body: { mimeType: "text/x-markdown", content: "일반 본문 수정" } });
    expect(writes[1].fileIdList).toEqual(["file-1"]);
    await client.updatePostComment("project-1", "post-1", "comment-1", { body: { mimeType: "text/x-markdown", content: "파일 참조 삭제" } }, { removeFileId: "file-1" });
    expect(writes[2].fileIdList).toEqual([]);
  });
  it("카드 없이 본문 링크만 있는 CLI 업로드 파일도 삭제한다", async () => {
    const response = structuredClone(fixtures.comment);
    response.result.fileIdList = [];
    response.result.body.content = "본문\n[파일](/files/file-1)";
    const { writes } = server(response), client = api();
    await client.updatePostComment("project-1", "post-1", "comment-1", { body: { mimeType: "text/x-markdown", content: "본문" } }, { removeFileId: "file-1" });
    await client.deletePostFile("project-1", "post-1", "file-1");
    expect(writes).toEqual([{ body: { mimeType: "text/x-markdown", content: "본문" }, fileIdList: [] }, null]);
  });
  it("카드와 본문 어디에도 없는 파일은 PUT 전에 코드 3으로 거절한다", async () => {
    const { writes } = server();
    await expect(api().updatePostComment("project-1", "post-1", "comment-1", { body: { mimeType: "text/x-markdown", content: "본문" } }, { removeFileId: "missing-file" })).rejects.toMatchObject({ exitCode: 3 });
    expect(writes).toEqual([]);
  });
  it("작성·단건·삭제는 공식 구조를 유지하고 이메일을 발송하지 않는다", async () => {
    const { writes } = server(), client = api();
    expect((await client.createPostComment("project-1", "post-1", { body: { mimeType: "text/x-markdown", content: "댓글" } })).result).toEqual({ id: "created-1" });
    expect(writes[0]).toEqual([{ body: { mimeType: "text/x-markdown", content: "댓글" }, sendMailFlag: false, fileIdList: [] }]);
    const result = (await client.getPostComment("project-1", "post-1", "comment-1")).result;
    expect(result.files).toEqual([{ id: "file-1", name: "sample.txt", size: 6 }]);
    expect(result).not.toHaveProperty("mailUsers");
    expect(result).toHaveProperty("modifiedAt", null);
    expect((await client.deletePostComment("project-1", "post-1", "comment-1")).result).toBeNull();
  });
});
