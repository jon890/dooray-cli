import { afterEach, describe, expect, it, vi } from "vitest";
import { fileURLToPath } from "node:url";
import { DoorayApiClient } from "./client.js";

// 첨부 다운로드·업로드가 307 을 따라갈 때 인증 헤더를 어디로 보내는지 확인한다 (ADR-074).
const BASE = "https://api.dooray.com";
// 업로드에 넘길 실제 파일. pathname 은 퍼센트 인코딩돼 공백·한글 경로나 Windows 에서 열리지 않는다.
const THIS_FILE = fileURLToPath(import.meta.url);
const TRUSTED = "https://file-api.dooray.com/downloads/x";
const FOREIGN = "https://other.example.com/downloads/x?sig=secret";

function clientWithRedirect(status: number, location: string | null) {
  const c = new DoorayApiClient("key", BASE);
  const api = {
    get: vi.fn(() =>
      Promise.resolve(new Response(null, { status, headers: location ? { location } : {} })),
    ),
  };
  (c as unknown as { api: unknown }).api = api;
  return { c, api };
}

function stubFetch(handler: (url: string, init?: RequestInit) => Response) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => handler(String(url), init));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe("첨부 다운로드의 redirect", () => {
  it.each([
    ["downloadPostFile", (c: DoorayApiClient) => c.downloadPostFile("p", "post", "f1", "a.txt")],
    ["downloadWikiPageFile", (c: DoorayApiClient) => c.downloadWikiPageFile("w", "page", "f1", "a.txt")],
    ["downloadMessengerFile", (c: DoorayApiClient) => c.downloadMessengerFile("ch", "f1")],
  ])("%s 는 같은 도메인의 파일 서버에 인증 헤더를 실어 받는다", async (_name, call) => {
    const fetchMock = stubFetch(() => new Response("hello"));
    const { c } = clientWithRedirect(307, TRUSTED);
    const { buffer } = await call(c);
    expect(buffer.byteLength).toBe(5);
    expect(fetchMock).toHaveBeenCalledWith(
      TRUSTED,
      expect.objectContaining({ headers: { Authorization: "dooray-api key" }, signal: expect.any(AbortSignal) }),
    );
  });

  it.each([
    ["downloadPostFile", (c: DoorayApiClient) => c.downloadPostFile("p", "post", "f1", "a.txt"), "파일 다운로드"],
    ["downloadWikiPageFile", (c: DoorayApiClient) => c.downloadWikiPageFile("w", "page", "f1", "a.txt"), "위키 파일 다운로드"],
    ["downloadMessengerFile", (c: DoorayApiClient) => c.downloadMessengerFile("ch", "f1"), "메신저 파일 다운로드"],
  ])("%s 는 다른 도메인을 가리키면 그 주소를 부르지 않고 멈춘다", async (_name, call, label) => {
    const fetchMock = stubFetch(() => new Response("hello"));
    const { c } = clientWithRedirect(307, FOREIGN);
    const error = await call(c).catch((e) => e);
    expect(error).toMatchObject({ exitCode: 1 });
    expect(error.message).toContain(`${label} 리다이렉트가 예상하지 못한 주소(https://other.example.com)`);
    // 오류에 서명 같은 경로·쿼리를 싣지 않는다
    expect(error.message).not.toContain("secret");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("업무 다운로드도 307 이 아니면 파일 서버를 부르지 않는다", async () => {
    const fetchMock = stubFetch(() => new Response("hello"));
    const { c } = clientWithRedirect(403, null);
    await expect(c.downloadPostFile("p", "post", "f1", "a.txt")).rejects.toThrow(
      "파일 다운로드 실패 (예상 status 307, 실제 403)",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("경로에 넣는 id 를 인코딩한다", async () => {
    stubFetch(() => new Response("hello"));
    const { c, api } = clientWithRedirect(307, TRUSTED);
    await c.downloadPostFile("p", "post", "../../x?y", "a.txt");
    expect(api.get).toHaveBeenCalledWith(
      "project/v1/projects/p/posts/post/files/..%2F..%2Fx%3Fy",
      expect.anything(),
    );
  });

  it("메신저 다운로드도 경로에 넣는 id 를 인코딩한다", async () => {
    stubFetch(() => new Response("hello"));
    const { c, api } = clientWithRedirect(307, TRUSTED);
    await c.downloadMessengerFile("ch", "../../x?y");
    expect(api.get).toHaveBeenCalledWith("messenger/v1/channels/ch/files/..%2F..%2Fx%3Fy", expect.anything());
  });
});

describe("파일 서버의 다시 보내기", () => {
  it("파일 서버가 또 redirect 하면 따라가지 않고 멈춘다", async () => {
    const fetchMock = stubFetch(() => new Response(null, { status: 302, headers: { location: FOREIGN } }));
    const { c } = clientWithRedirect(307, TRUSTED);
    await expect(c.downloadPostFile("p", "post", "f1", "a.txt")).rejects.toThrow(
      "파일 다운로드 실패: 파일 서버가 다른 주소로 다시 보냈습니다 (302).",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ redirect: "manual" });
  });
});

describe("첨부 업로드의 redirect", () => {
  it.each([
    ["uploadPostFile", (c: DoorayApiClient, f: string) => c.uploadPostFile("p", "post", f), "파일 업로드"],
    ["uploadWikiPageFile", (c: DoorayApiClient, f: string) => c.uploadWikiPageFile("w", "page", f, "general"), "위키 파일 업로드"],
  ])("%s 는 다른 도메인을 가리키면 그 주소로 파일을 보내지 않는다", async (_name, call, label) => {
    const fetchMock = stubFetch((url) =>
      url.startsWith(BASE) ? new Response(null, { status: 307, headers: { location: FOREIGN } }) : new Response("{}"),
    );
    const c = new DoorayApiClient("key", BASE);
    const error = await call(c, THIS_FILE).catch((e) => e);
    expect(error.message).toContain(`${label} 리다이렉트가 예상하지 못한 주소`);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toMatch(/^https:\/\/api\.dooray\.com\//);
  });

  it("업로드 경로의 id 를 인코딩하고 응답 시간 제한을 걸지 않는다", async () => {
    const fetchMock = stubFetch((url) =>
      url.startsWith(BASE)
        ? new Response(null, { status: 307, headers: { location: TRUSTED } })
        : new Response(JSON.stringify({ result: { id: "new" } })),
    );
    const c = new DoorayApiClient("key", BASE);
    await c.uploadWikiPageFile("w/1", "p?2", THIS_FILE, "general");
    expect(fetchMock.mock.calls[0]![0]).toBe(`${BASE}/wiki/v1/wikis/w%2F1/pages/p%3F2/files`);
    // 업로드는 본문 전송이 끝나야 응답이 와서, 응답 시간 제한이 곧 전송 시간 제한이 된다
    for (const [, init] of fetchMock.mock.calls) expect(init?.signal).toBeUndefined();
  });

  it("같은 도메인의 파일 서버로는 인증 헤더와 함께 다시 보낸다", async () => {
    const fetchMock = stubFetch((url) =>
      url.startsWith(BASE)
        ? new Response(null, { status: 307, headers: { location: TRUSTED } })
        : new Response(JSON.stringify({ result: { id: "new" } })),
    );
    const c = new DoorayApiClient("key", BASE);
    const res = await c.uploadPostFile("p", "post", THIS_FILE);
    expect(res).toEqual({ result: { id: "new" } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]![0]).toBe(TRUSTED);
    expect(fetchMock.mock.calls[1]![1]).toMatchObject({ method: "POST", headers: { Authorization: "dooray-api key" } });
  });
});
