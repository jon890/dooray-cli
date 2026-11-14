import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createWebClient } from "../web/index.js";
import { collectWikiPages } from "./pages.js";
import { fetchAllWikis } from "../../resolvers/wiki.js";

const fixtures = JSON.parse(readFileSync(new URL("../web/fixtures/wiki/responses.json", import.meta.url), "utf8"));
const client = () => createWebClient("fake-session", "https://my-org.dooray.com", "https://api.dooray.com");
const W = "/v2/wapi/wikis/wiki-1";
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

interface Call { method: string; url: URL; headers: Headers; body?: unknown; form?: FormData }
type Handler = (call: Call) => unknown;

/** 경로별로 가짜 응답을 돌려주고 호출 기록을 남긴다. 등록하지 않은 경로는 실패시킨다. */
function route(handlers: Record<string, Handler>): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: Request | string, init?: RequestInit) => {
    let call: Call;
    if (input instanceof Request) {
      const raw = input.body ? await input.clone().text() : "";
      call = { method: input.method, url: new URL(input.url), headers: input.headers, ...(raw && { body: JSON.parse(raw) }) };
    } else {
      call = { method: init?.method ?? "GET", url: new URL(input), headers: new Headers(init?.headers), ...(init?.body instanceof FormData && { form: init.body }) };
    }
    calls.push(call);
    const key = `${call.method} ${call.url.pathname}`;
    const handler = handlers[key];
    if (!handler) throw new Error(`등록하지 않은 호출: ${key}`);
    const result = handler(call);
    return result instanceof Response ? result : Response.json(result);
  }));
  return calls;
}

const paths = (calls: Call[]) => calls.map((c) => `${c.method} ${c.url.pathname}`);
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("웹 위키 읽기 변환", () => {
  it("위키 목록은 공식 키만 내고 page·size 를 그대로 보낸다", async () => {
    const calls = route({ "GET /v2/wapi/wikis": () => fixtures.wikis });
    const res = await client().getWikis({ page: 1, size: 1 });
    expect(Object.fromEntries(calls[0].url.searchParams)).toEqual({ page: "1", size: "1" });
    expect(res.totalCount).toBe(2);
    expect(res.result).toEqual([{ id: "wiki-1", project: { id: "project-1" }, name: "팀 위키", type: "public", scope: "private", home: { pageId: "page-home" } }]);
  });

  it("fetchAllWikis 는 page 를 올리며 totalCount 에서 멈추고 같은 페이지를 거듭 받지 않는다", async () => {
    const seen: string[] = [];
    route({ "GET /v2/wapi/wikis": ({ url }) => {
      const page = url.searchParams.get("page")!; seen.push(page);
      const body = clone(fixtures.wikis); body.result.contents[0].id = `wiki-${page}`;
      return body;
    } });
    const all = await fetchAllWikis(client());
    expect(seen).toEqual(["0", "1"]);
    expect(all.map((w) => w.id)).toEqual(["wiki-0", "wiki-1"]);
  });

  it.each([
    ["name", (b: any) => delete b.result.contents[0].name],
    ["project.id", (b: any) => delete b.result.contents[0].projectId],
    ["home.pageId", (b: any) => delete b.result.contents[0].home.pageId],
    ["totalCount", (b: any) => delete b.result.totalCount],
  ])("위키 목록의 필수 %s 가 없으면 API 오류로 끝낸다", async (_name, mutate) => {
    const body = clone(fixtures.wikis); mutate(body);
    route({ "GET /v2/wapi/wikis": () => body });
    await expect(client().getWikis()).rejects.toMatchObject({ exitCode: 1 });
  });

  it("페이지 목록은 parentPageId 만 보내고 홈 페이지는 parentPageId 키가 없다", async () => {
    const calls = route({ [`GET ${W}/pages`]: ({ url }) => url.searchParams.has("parentPageId") ? fixtures.pagesChildren : fixtures.pagesRoot });
    const root = await client().getWikiPages("wiki-1");
    const kids = await client().getWikiPages("wiki-1", "page-home");
    expect([...calls[0].url.searchParams]).toEqual([]);
    expect(Object.fromEntries(calls[1].url.searchParams)).toEqual({ parentPageId: "page-home" });
    expect(root.result[0]).toEqual({ id: "page-home", wikiId: "wiki-1", version: 1, root: true, creator: { type: "member", member: { organizationMemberId: "member-1" } }, subject: "홈" });
    expect(root.result[0]).not.toHaveProperty("parentPageId");
    expect(kids.result[0]).toEqual({ id: "page-a", wikiId: "wiki-1", version: 4, root: false, creator: { type: "member", member: { organizationMemberId: "member-1" } }, subject: "가이드", parentPageId: "page-home" });
    expect(JSON.stringify(kids)).not.toMatch(/hasChildren|order|status|restricted/);
  });

  it.each(["pageId", "wikiId", "subject", "version"])("페이지 목록의 필수 %s 가 없으면 API 오류로 끝낸다", async (key) => {
    const body = clone(fixtures.pagesChildren); delete body.result.contents[0][key];
    route({ [`GET ${W}/pages`]: () => body });
    await expect(client().getWikiPages("wiki-1", "page-home")).rejects.toMatchObject({ exitCode: 1 });
  });

  it("페이지 상세는 공식 필드만 내고 첨부의 downloadUrl 을 숨긴다", async () => {
    route({ [`GET ${W}/pages/page-a`]: () => fixtures.pageDetail });
    const { result } = await client().getWikiPage("wiki-1", "page-a");
    expect(result).toEqual({
      id: "page-a", wikiId: "wiki-1", version: 4, parentPageId: "page-home", subject: "가이드", root: false,
      body: { mimeType: "text/x-markdown", content: "본문" },
      createdAt: "2026-11-14T01:07:00+09:00", updatedAt: "2026-11-14T02:00:00+09:00",
      creator: { type: "member", member: { organizationMemberId: "member-1" } },
      referrers: [{ type: "member", member: { organizationMemberId: "member-2" } }],
      files: [{ id: "file-1", name: "보고서.txt", size: 22, attachFileId: "attach-1" }],
      images: [{ id: "image-1", name: "그림.png", size: 70, attachFileId: "attach-2" }],
    });
    expect(JSON.stringify(result)).not.toMatch(/downloadUrl|contentId|breadcrumb|reactions|wikiMemberId/);
  });

  it("--url 입력처럼 프로젝트 id 가 wikiId 자리에 와도 같은 경로로 부른다", async () => {
    const calls = route({ "GET /v2/wapi/wikis/project-1/pages/page-a": () => fixtures.pageDetail });
    await client().getWikiPage("project-1", "page-a");
    expect(paths(calls)).toEqual(["GET /v2/wapi/wikis/project-1/pages/page-a"]);
  });

  it("단독 조회는 가벼운 응답으로 wikiId 를 얻은 뒤 상세를 부른다", async () => {
    const calls = route({ "GET /v2/wapi/pages/page-a": () => fixtures.pageLight, [`GET ${W}/pages/page-a`]: () => fixtures.pageDetail });
    const { result } = await client().getWikiPageStandalone("page-a");
    expect(paths(calls)).toEqual(["GET /v2/wapi/pages/page-a", `GET ${W}/pages/page-a`]);
    expect(result.body?.content).toBe("본문");
  });

  it("collectWikiPages 는 웹 구현에서도 깊이 상한을 지키고 레벨 안 순서를 보존한다", async () => {
    route({ [`GET ${W}/pages`]: ({ url }) => {
      const parent = url.searchParams.get("parentPageId");
      return parent === null ? fixtures.pagesRoot : parent === "page-home" ? fixtures.pagesChildren : parent === "page-a" ? fixtures.pagesGrandchildren : fixtures.pagesNone;
    } });
    expect((await collectWikiPages(client(), "wiki-1")).map((p) => p.id)).toEqual(["page-home", "page-a", "page-b", "page-c"]);
    expect((await collectWikiPages(client(), "wiki-1", 2)).map((p) => p.id)).toEqual(["page-home", "page-a", "page-b"]);
  });
});

describe("웹 위키 페이지 쓰기", () => {
  it("생성은 같은 부모의 같은 제목이 있으면 쓰기 전에 종료 코드 1 로 막는다", async () => {
    const calls = route({ [`GET ${W}/pages`]: () => fixtures.pagesChildren });
    const create = client().createWikiPage("wiki-1", { subject: "가이드", body: { mimeType: "text/x-markdown", content: "x" }, parentPageId: "page-home" });
    await expect(create).rejects.toMatchObject({ exitCode: 1, message: "같은 위치에 같은 제목의 페이지가 있습니다." });
    expect(paths(calls)).toEqual([`GET ${W}/pages`]);
  });

  it("생성은 다른 제목이면 공개 API 와 같은 본문으로 보내고 id 를 공식 키로 돌려준다", async () => {
    const calls = route({
      [`GET ${W}/pages`]: () => fixtures.pagesChildren, [`POST ${W}/pages`]: () => fixtures.created,
      [`GET ${W}/pages/page-new`]: () => ({ ...clone(fixtures.pageDetail), result: { content: { ...fixtures.pageDetail.result.content, pageId: "page-new", subject: "새 글" } } }),
    });
    const body = { subject: "새 글", body: { mimeType: "text/x-markdown", content: "내용" }, parentPageId: "page-home" };
    const res = await client().createWikiPage("wiki-1", body);
    expect(calls.find((c) => c.method === "POST")?.body).toEqual(body);
    expect(res.result).toEqual({ id: "page-new", wikiId: "wiki-1", parentPageId: "page-home", version: 1 });
  });

  it("쓴 뒤 저장된 제목이 요청과 다르면 stderr 로 경고한다", async () => {
    const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    route({
      [`GET ${W}/pages`]: () => fixtures.pagesNone, [`POST ${W}/pages`]: () => fixtures.created,
      [`GET ${W}/pages/page-new`]: () => ({ ...clone(fixtures.pageDetail), result: { content: { ...fixtures.pageDetail.result.content, pageId: "page-new", subject: "새 글 (1)" } } }),
    });
    await client().createWikiPage("wiki-1", { subject: "새 글", body: { mimeType: "text/x-markdown", content: "" }, parentPageId: "page-home" });
    expect(write).toHaveBeenCalledWith(expect.stringContaining("저장된 제목: 새 글 (1)"));
  });

  it("쓴 뒤 저장된 제목을 읽지 못해도 쓰기는 성공으로 끝나고 경고만 낸다", async () => {
    const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    route({ [`GET ${W}/pages`]: () => fixtures.pagesNone, [`POST ${W}/pages`]: () => fixtures.created, [`GET ${W}/pages/page-new`]: () => fixtures.notFound });
    const res = await client().createWikiPage("wiki-1", { subject: "새 글", body: { mimeType: "text/x-markdown", content: "" }, parentPageId: "page-home" });
    expect(res.result.id).toBe("page-new");
    expect(write).toHaveBeenCalledWith(expect.stringContaining("저장된 제목을 확인하지 못했습니다"));
  });

  it("본문 형식이 text/x-markdown 이 아니면 호출 없이 종료 코드 3 으로 끝난다", async () => {
    const calls = route({});
    await expect(client().createWikiPage("wiki-1", { subject: "a", body: { mimeType: "text/html", content: "x" }, parentPageId: "page-home" })).rejects.toMatchObject({ exitCode: 3 });
    await expect(client().updateWikiPageContent("wiki-1", "page-a", { body: { mimeType: "text/html", content: "x" } })).rejects.toMatchObject({ exitCode: 3 });
    await expect(client().updateWikiPage("wiki-1", "page-a", { subject: "a", body: { mimeType: "text/plain", content: "x" } })).rejects.toMatchObject({ exitCode: 3 });
    expect(calls).toEqual([]);
  });

  it("제목만 또는 본문만 주는 전체 수정은 호출 없이 종료 코드 3 으로 끝난다", async () => {
    const calls = route({});
    await expect(client().updateWikiPage("wiki-1", "page-a", { subject: "a" })).rejects.toMatchObject({ exitCode: 3 });
    await expect(client().updateWikiPage("wiki-1", "page-a", { body: { mimeType: "text/x-markdown", content: "x" } })).rejects.toMatchObject({ exitCode: 3 });
    expect(calls).toEqual([]);
  });

  it("전체 수정은 제목이 그대로면 형제 확인 없이 PUT 하고 null 을 돌려준다", async () => {
    const calls = route({ [`GET ${W}/pages/page-a`]: () => fixtures.pageDetail, [`PUT ${W}/pages/page-a`]: () => fixtures.updated });
    const res = await client().updateWikiPage("wiki-1", "page-a", { subject: "가이드", body: { mimeType: "text/x-markdown", content: "바뀐 본문" } });
    expect(res.result).toBeNull();
    expect(paths(calls)).toEqual([`GET ${W}/pages/page-a`, `PUT ${W}/pages/page-a`, `GET ${W}/pages/page-a`]);
  });

  it("제목을 형제의 제목으로 바꾸면 PUT 전에 종료 코드 1 로 막고, 자기 자신은 형제로 보지 않는다", async () => {
    const calls = route({ [`GET ${W}/pages/page-a`]: () => fixtures.pageDetail, [`GET ${W}/pages`]: () => fixtures.pagesChildren });
    await expect(client().updateWikiPageTitle("wiki-1", "page-a", { subject: "공지" })).rejects.toMatchObject({ exitCode: 1 });
    expect(calls.some((c) => c.method === "PUT")).toBe(false);
    const ok = route({ [`GET ${W}/pages/page-a`]: () => fixtures.pageDetail, [`GET ${W}/pages`]: () => fixtures.pagesChildren, [`PUT ${W}/pages/page-a/title`]: () => ({ ...fixtures.titleUpdated, result: { ...fixtures.titleUpdated.result, title: "독자 제목" } }) });
    await expect(client().updateWikiPageTitle("wiki-1", "page-a", { subject: "독자 제목" })).resolves.toMatchObject({ result: null });
    expect(ok.find((c) => c.method === "PUT")?.body).toEqual({ subject: "독자 제목" });
  });

  it("제목 수정 응답의 title 이 요청과 다르면 경고한다", async () => {
    const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    route({ [`GET ${W}/pages/page-a`]: () => fixtures.pageDetail, [`GET ${W}/pages`]: () => fixtures.pagesNone, [`PUT ${W}/pages/page-a/title`]: () => fixtures.titleUpdated });
    await client().updateWikiPageTitle("wiki-1", "page-a", { subject: "새 제목 요청" });
    expect(write).toHaveBeenCalledWith(expect.stringContaining("저장된 제목: 새 제목"));
  });

  it("본문 수정은 응답 객체를 버리고 null 을 돌려준다", async () => {
    const calls = route({ [`PUT ${W}/pages/page-a/content`]: () => ({ ...fixtures.updated, result: { ...fixtures.pageDetail.result.content } }) });
    const res = await client().updateWikiPageContent("wiki-1", "page-a", { body: { mimeType: "text/x-markdown", content: "" } });
    expect(res.result).toBeNull();
    expect(calls[0].body).toEqual({ body: { mimeType: "text/x-markdown", content: "" } });
  });

  it("삭제는 DELETE 하고 null 을 돌려준다", async () => {
    const calls = route({ [`DELETE ${W}/pages/page-a`]: () => fixtures.deleted });
    expect((await client().deleteWikiPage("wiki-1", "page-a")).result).toBeNull();
    expect(paths(calls)).toEqual([`DELETE ${W}/pages/page-a`]);
  });

  it("없는 페이지의 HTTP 200 + resultCode 404 는 종료 코드 1 이다", async () => {
    route({ [`GET ${W}/pages/gone`]: () => fixtures.notFound });
    await expect(client().getWikiPage("wiki-1", "gone")).rejects.toMatchObject({ exitCode: 1 });
  });
});

describe("웹 위키 이동", () => {
  it("값은 쿼리로 보내고 요청 본문은 없다", async () => {
    const calls = route({ [`POST ${W}/pages/page-b/move`]: () => fixtures.updated });
    await client().moveWikiPage("wiki-1", "page-b", { targetParentPageId: "page-a" });
    await client().moveWikiPage("wiki-1", "page-b", { targetParentPageId: "page-a", beforePageId: "0", withChildren: false });
    await client().moveWikiPage("wiki-1", "page-b", { targetParentPageId: "page-a", beforePageId: "page-c", withChildren: true });
    expect(calls.map((c) => Object.fromEntries(c.url.searchParams))).toEqual([
      { targetParentPageId: "page-a" },
      { targetParentPageId: "page-a", beforePageId: "0", withChildren: "false" },
      { targetParentPageId: "page-a", beforePageId: "page-c" },
    ]);
    expect(calls.every((c) => c.body === undefined)).toBe(true);
  });

  it("targetWikiId 가 오면 호출 없이 종료 코드 3 으로 끝난다", async () => {
    const calls = route({});
    await expect(client().moveWikiPage("wiki-1", "page-b", { targetParentPageId: "page-a", targetWikiId: "wiki-2" })).rejects.toMatchObject({ exitCode: 3 });
    expect(calls).toEqual([]);
  });
});

describe("웹 위키 댓글", () => {
  it("목록은 size=(page+1)*size 로 받아 최신순으로 뒤집어 자른다", async () => {
    const calls = route({ [`GET ${W}/pages/page-a/comments`]: ({ url }) => {
      // 웹처럼 page 를 무시하고 가장 최근 N개만 오래된 것부터 준다.
      const size = Number(url.searchParams.get("size"));
      const body = clone(fixtures.comments); body.result.contents = body.result.contents.slice(-size);
      return body;
    } });
    const first = await client().getWikiPageComments("wiki-1", "page-a", { page: 0, size: 2 });
    const second = await client().getWikiPageComments("wiki-1", "page-a", { page: 1, size: 2 });
    expect(calls.map((c) => c.url.searchParams.get("size"))).toEqual(["2", "4"]);
    expect(first.result.map((c) => c.id)).toEqual(["comment-5", "comment-4"]);
    expect(second.result.map((c) => c.id)).toEqual(["comment-3"]);
    expect(first.totalCount).toBe(5);
  });

  it("인자가 없으면 page 0, size 20 이다", async () => {
    const calls = route({ [`GET ${W}/pages/page-a/comments`]: () => fixtures.comments });
    const res = await client().getWikiPageComments("wiki-1", "page-a");
    expect(calls[0].url.searchParams.get("size")).toBe("20");
    expect(res.result.map((c) => c.id)).toEqual(["comment-5", "comment-4", "comment-3"]);
  });

  it("(page+1)*size 가 1000 을 넘으면 호출 없이 종료 코드 3 으로 끝난다", async () => {
    const calls = route({});
    await expect(client().getWikiPageComments("wiki-1", "page-a", { page: 10, size: 100 })).rejects.toMatchObject({ exitCode: 3 });
    await expect(client().getWikiPageComments("wiki-1", "page-a", { page: 0, size: 0 })).rejects.toMatchObject({ exitCode: 3 });
    expect(calls).toEqual([]);
  });

  it("댓글을 공식 모양으로 바꾼다", async () => {
    route({ [`GET ${W}/pages/page-a/comments/comment-3`]: () => fixtures.comment });
    const { result } = await client().getWikiPageComment("wiki-1", "page-a", "comment-3");
    expect(result).toEqual({
      id: "comment-3", page: { id: "page-a" }, createdAt: "2026-11-14T01:03:00+09:00", modifiedAt: "2026-11-14T01:03:00+09:00",
      creator: { type: "member", member: { organizationMemberId: "member-1", name: "홍길동" } },
      body: { mimeType: "text/x-markdown", content: "셋째" },
    });
  });

  it("추가·수정 요청 본문에 mimeType 과 attachFileIds 를 싣고 응답을 공식 키로 바꾼다", async () => {
    const calls = route({
      [`POST ${W}/pages/page-a/comments`]: () => fixtures.commentCreated,
      [`PUT ${W}/pages/page-a/comments/comment-3`]: () => fixtures.deleted,
      [`DELETE ${W}/pages/page-a/comments/comment-3`]: () => fixtures.deleted,
    });
    expect((await client().addWikiPageComment("wiki-1", "page-a", { body: { content: "새 댓글" } })).result).toEqual({ id: "comment-9" });
    expect((await client().updateWikiPageComment("wiki-1", "page-a", "comment-3", { body: { content: "고침" } })).result).toBeNull();
    expect((await client().deleteWikiPageComment("wiki-1", "page-a", "comment-3")).result).toBeNull();
    expect(calls[0].body).toEqual({ body: { content: "새 댓글", mimeType: "text/x-markdown" }, attachFileIds: [] });
    expect(calls[1].body).toEqual({ body: { content: "고침", mimeType: "text/x-markdown" }, attachFileIds: [] });
  });
});

describe("웹 위키 첨부", () => {
  it("업로드는 type 을 file 보다 먼저 담고 응답에서 웹 전용 필드를 뺀다", async () => {
    const dir = await mkdtemp(join(tmpdir(), "wiki-web-"));
    try {
      const file = join(dir, "올림.txt"); await writeFile(file, "sample");
      const calls = route({ [`POST ${W}/pages/page-a/files`]: () => fixtures.uploaded });
      const res = await client().uploadWikiPageFile("wiki-1", "page-a", file, "general");
      expect([...calls[0].form!.keys()]).toEqual(["type", "file"]);
      expect(calls[0].form!.get("type")).toBe("general");
      expect((calls[0].form!.get("file") as File).name).toBe("올림.txt");
      expect(res.result).toEqual({ id: "file-9", attachFileId: "attach-9", name: "올림.txt", mimeType: "application/octet-stream", type: "general", size: 6, createdAt: "2026-11-14T03:00:00+09:00" });
      expect(calls[0].headers.get("cookie")).toBe("SESSION=fake-session");
    } finally { await rm(dir, { recursive: true, force: true }); }
  });

  it("다운로드는 상세로 확인한 뒤 응답의 downloadUrl 이 아니라 fileId 로 만든 경로를 부른다", async () => {
    const detail = clone(fixtures.pageDetail);
    detail.result.content.files[0].downloadUrl = "https://example.com/steal";
    const calls = route({
      [`GET ${W}/pages/page-a`]: () => detail,
      "GET /page-files/file-1": () => new Response("bytes", { headers: { "content-disposition": "attachment; filename*=UTF-8''%EB%B3%B4%EA%B3%A0.txt" } }),
    });
    const { buffer, fileName } = await client().downloadWikiPageFile("wiki-1", "page-a", "file-1");
    expect(paths(calls)).toEqual([`GET ${W}/pages/page-a`, "GET /page-files/file-1"]);
    expect(calls[1].url.origin).toBe("https://my-org.dooray.com");
    expect(new TextDecoder().decode(buffer)).toBe("bytes");
    expect(fileName).toBe("보고.txt");
  });

  it("저장 이름에서 ../ 경로를 떼고, 헤더가 없으면 knownName → 상세 이름 순으로 대체한다", async () => {
    route({
      [`GET ${W}/pages/page-a`]: () => fixtures.pageDetail,
      "GET /page-files/file-1": () => new Response("x", { headers: { "content-disposition": 'attachment; filename="../../escape.txt"' } }),
      "GET /page-files/image-1": () => new Response("x"),
    });
    expect((await client().downloadWikiPageFile("wiki-1", "page-a", "file-1")).fileName).toBe("escape.txt");
    expect((await client().downloadWikiPageFile("wiki-1", "page-a", "image-1")).fileName).toBe("그림.png");
    expect((await client().downloadWikiPageFile("wiki-1", "page-a", "image-1", "알려진.png")).fileName).toBe("알려진.png");
  });

  it("페이지 상세에 없는 fileId 는 파일 요청 없이 종료 코드 1 로 끝난다", async () => {
    const calls = route({ [`GET ${W}/pages/page-a`]: () => fixtures.pageDetail });
    await expect(client().downloadWikiPageFile("wiki-1", "page-a", "other-page-file")).rejects.toMatchObject({ exitCode: 1, message: "이 페이지에 없는 파일입니다." });
    await expect(client().deleteWikiPageFile("wiki-1", "page-a", "other-page-file")).rejects.toMatchObject({ exitCode: 1 });
    expect(calls.every((c) => c.method === "GET" && c.url.pathname.includes("/pages/page-a"))).toBe(true);
  });

  it("download-all 처럼 getWikiPage 뒤 이어지는 다운로드는 페이지 상세를 다시 읽지 않는다", async () => {
    const calls = route({
      [`GET ${W}/pages/page-a`]: () => fixtures.pageDetail,
      "GET /page-files/file-1": () => new Response("a"), "GET /page-files/image-1": () => new Response("b"),
    });
    const wiki = client();
    const page = (await wiki.getWikiPage("wiki-1", "page-a")).result;
    for (const f of [...(page.files ?? []), ...(page.images ?? [])]) await wiki.downloadWikiPageFile("wiki-1", "page-a", f.id, f.name);
    expect(paths(calls).filter((p) => p === `GET ${W}/pages/page-a`)).toHaveLength(1);
  });

  it("삭제는 상세 확인 뒤 page-files 경로로 나가고, 이후 상세 캐시를 비운다", async () => {
    const calls = route({
      [`GET ${W}/pages/page-a`]: () => fixtures.pageDetail, [`DELETE ${W}/page-files/file-1`]: () => fixtures.deleted,
      "GET /page-files/image-1": () => new Response("b"),
    });
    const wiki = client();
    expect((await wiki.deleteWikiPageFile("wiki-1", "page-a", "file-1")).result).toBeNull();
    await wiki.downloadWikiPageFile("wiki-1", "page-a", "image-1");
    expect(paths(calls)).toEqual([`GET ${W}/pages/page-a`, `DELETE ${W}/page-files/file-1`, `GET ${W}/pages/page-a`, "GET /page-files/image-1"]);
  });

  it("같은 페이지를 프로젝트 id 로 불러도 pageId 가 같으면 캐시를 공유한다", async () => {
    const calls = route({
      "GET /v2/wapi/wikis/project-1/pages/page-a": () => fixtures.pageDetail, [`GET ${W}/pages/page-a`]: () => fixtures.pageDetail,
      "GET /page-files/file-1": () => new Response("a"),
    });
    const wiki = client();
    await wiki.getWikiPage("project-1", "page-a");
    await wiki.downloadWikiPageFile("wiki-1", "page-a", "file-1");
    expect(paths(calls)).toEqual(["GET /v2/wapi/wikis/project-1/pages/page-a", "GET /page-files/file-1"]);
  });
});
