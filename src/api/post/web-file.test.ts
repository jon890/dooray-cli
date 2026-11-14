import { readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPostWeb } from "./web.js";
import { WebContext } from "../web/context.js";
const fixtures = JSON.parse(readFileSync(new URL("../web/fixtures/post/responses.json", import.meta.url), "utf8"));
function setup() {
  const context = new WebContext("fake-session", "https://example.dooray.com", "https://api.dooray.com");
  const request = vi.spyOn(context.http, "request").mockImplementation(async (_url, options) => structuredClone(options?.method === "DELETE" ? fixtures.unit : String(_url).endsWith("/files") ? fixtures.files : fixtures.detail));
  return { context, request, api: createPostWeb(context) };
}
afterEach(() => vi.unstubAllGlobals());
describe("웹 업무 파일과 공용 전송 경계", () => {
  it("목록·메타는 공식 필드만 반환하고 파일 시간대의 콜론을 보충한다", async () => {
    const { api } = setup();
    const response = await api.getPostFiles("project-1", "post-1");
    expect(response.result[0].createdAt).toBe("2026-01-02T03:04:05+09:00");
    expect(response.result[0]).not.toHaveProperty("downloadUrl");
    expect((await api.getPostFileMeta("project-1", "post-1", "file-1")).result).toEqual(response.result[0]);
    await expect(api.getPostFileMeta("project-1", "post-1", "foreign-file")).rejects.toMatchObject({ exitCode: 1 });
  });
  it("확인한 파일만 PR1 requestBytes로 내려받고 안전한 이름을 사용한다", async () => {
    const { context, api } = setup();
    const bytes = vi.spyOn(context.http, "requestBytes").mockResolvedValue(new Response("sample", { headers: { "content-disposition": 'attachment; filename="../../safe.txt"' } }));
    const result = await api.downloadPostFile("project-1", "post-1", "file-1");
    expect(Buffer.from(result.buffer).toString()).toBe("sample");
    expect(result.fileName).toBe("safe.txt");
    expect(bytes).toHaveBeenCalledWith("files/file-1", { searchParams: { disposition: "attachment" } });
    await expect(api.downloadPostFile("project-1", "post-1", "foreign-file")).rejects.toMatchObject({ exitCode: 1 });
    expect(bytes).toHaveBeenCalledTimes(1);
  });
  it.each(["redirect", "html"])("다운로드의 %s 세션 만료를 코드 2로 처리한다", async (kind) => {
    const { api } = setup();
    vi.stubGlobal("fetch", vi.fn(async () => kind === "redirect" ? new Response(null, { status: 302, headers: { location: "/auth/signin" } }) : new Response("<html>login</html>", { headers: { "content-type": "text/html" } })));
    await expect(api.downloadPostFile("project-1", "post-1", "file-1")).rejects.toMatchObject({ exitCode: 2 });
  });
  it("파일 목록과 업무 상세의 소속 정보가 다르면 바이트 요청을 하지 않는다", async () => {
    const { api, context, request } = setup();
    const files = structuredClone(fixtures.files); files.result.content[0].id = "foreign-file";
    request.mockImplementation(async (url) => structuredClone(String(url).endsWith("/files") ? files : fixtures.detail));
    const bytes = vi.spyOn(context.http, "requestBytes");
    await expect(api.downloadPostFile("project-1", "post-1", "foreign-file")).rejects.toMatchObject({ exitCode: 1 });
    expect(bytes).not.toHaveBeenCalled();
  });
  it("업로드는 PR1 upload에 multipart file을 전달하고 ID만 반환한다", async () => {
    const { context, api } = setup();
    const upload = vi.spyOn(context.http, "upload").mockResolvedValue(fixtures.created);
    const dir = await mkdtemp(join(tmpdir(), "post-file-test-"));
    try {
      const source = join(dir, "sample.txt"); await writeFile(source, "sample");
      expect((await api.uploadPostFile("project-1", "post-1", source)).result).toEqual({ id: "created-1" });
      const [url, form, opts] = upload.mock.calls[0];
      expect(url).toBe("wapi/task/v1/tasks/post-1/files");
      expect(opts).toEqual({ searchParams: { type: "general" } });
      expect(await (form.get("file") as File).text()).toBe("sample");
    } finally { await rm(dir, { recursive: true }); }
  });
  it("삭제는 소속 확인 뒤 업무 번호 경로로 요청한다", async () => {
    const { api, request } = setup();
    expect((await api.deletePostFile("project-1", "post-1", "file-1")).result).toBeNull();
    expect(request).toHaveBeenLastCalledWith("v2/wapi/projects/!project-1/posts/42/files/file-1", { method: "DELETE" });
  });
});
