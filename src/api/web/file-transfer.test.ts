import { afterEach, describe, expect, it, vi } from "vitest";
import { WebHttp, SESSION_EXPIRED_MESSAGE } from "./http.js";
const origin = "https://my-org.dooray.com", publicApi = "https://api.dooray.com", cookie = "fake-session-secret";
const http = () => new WebHttp(origin, cookie, publicApi);
const envelope = { header: { isSuccessful: true, resultCode: 0, resultMessage: "" }, result: { id: "file-1" } };
const redirect = (location: string) => new Response(null, { status: 307, headers: { Location: location } });
function form() { const body = new FormData(); body.append("file", new Blob(["sample"]), "sample.txt"); return body; }
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("웹 첨부 공통 전송", () => {
  it("직접 200 인 바이트 응답을 보존하고 쿼리·쿠키·manual 을 보낸다", async () => {
    const fetch = vi.fn(async (_url: string, _init: RequestInit) => new Response(new Uint8Array([1, 2, 3]))); vi.stubGlobal("fetch", fetch);
    const response = await http().requestBytes("wapi/files", { searchParams: { media: "raw" }, redirect: "follow", headers: { Authorization: "drop" } });
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(origin + "/wapi/files?media=raw");
    expect(init.redirect).toBe("manual"); expect(new Headers(init.headers).get("cookie")).toBe("SESSION=" + cookie);
    expect(new Headers(init.headers).has("Authorization")).toBe(false);
  });
  it("같은 클라우드의 https 파일 서버로 307 을 한 번 따라간다", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(redirect("https://file-api.dooray.com/download")).mockResolvedValueOnce(new Response("bytes")); vi.stubGlobal("fetch", fetch);
    expect(await (await http().requestBytes("wapi/files")).text()).toBe("bytes");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1][0]).toBe("https://file-api.dooray.com/download");
    expect(fetch.mock.calls[1][1].redirect).toBe("manual");
    expect(new Headers(fetch.mock.calls[1][1].headers).get("cookie")).toBe("SESSION=" + cookie);
  });
  it.each(["https://example.com/download", "http://file-api.dooray.com/download", "https://file-api.gov-dooray.com/download"])("허용하지 않는 %s 에는 쿠키·요청을 보내지 않는다", async (location) => {
    const fetch = vi.fn(async () => redirect(location)); vi.stubGlobal("fetch", fetch);
    await expect(http().requestBytes("wapi/files")).rejects.toMatchObject({ exitCode: 1 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("첫 요청도 다른 origin 이면 fetch 전에 막는다", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    await expect(http().requestBytes(new URL("https://example.com/file"))).rejects.toMatchObject({ exitCode: 1 });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("연쇄 307 은 두 번째 응답에서 멈춘다", async () => {
    const fetch = vi.fn(async () => redirect("https://file-api.dooray.com/again")); vi.stubGlobal("fetch", fetch);
    await expect(http().requestBytes("wapi/files")).rejects.toMatchObject({ exitCode: 1 });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it.each(["initial", "file-server"])("%s 의 로그인 302 는 세션 만료이며 바이트를 돌려주지 않는다", async (stage) => {
    const signin = new Response(null, { status: 302, headers: { Location: "/auth/signin" } });
    const fetch = vi.fn(); if (stage === "file-server") fetch.mockResolvedValueOnce(redirect("https://file-api.dooray.com/file"));
    fetch.mockResolvedValueOnce(signin); vi.stubGlobal("fetch", fetch);
    await expect(http().requestBytes("wapi/files")).rejects.toMatchObject({ exitCode: 2, message: SESSION_EXPIRED_MESSAGE });
    expect(fetch).toHaveBeenCalledTimes(stage === "initial" ? 1 : 2);
  });
  it.each(["text/html", "text/plain"])("%s 로그인 HTML 200 은 파일로 반환하지 않는다", async (type) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html><form action=\"/auth/signin\">login</form></html>", { headers: { "Content-Type": type } })));
    await expect(http().requestBytes("wapi/files")).rejects.toMatchObject({ exitCode: 2 });
    await expect(http().upload("wapi/files", form())).rejects.toMatchObject({ exitCode: 2 });
  });
  it("첨부로 지정된 일반 HTML 파일은 보존한다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>sample</html>", { headers: { "Content-Type": "text/html", "Content-Disposition": "attachment; filename=sample.html" } })));
    expect(await (await http().requestBytes("wapi/files")).text()).toBe("<html>sample</html>");
  });
  it("multipart 업로드의 직접 200 과 307 뒤 JSON 응답을 같은 형식으로 돌려준다", async () => {
    const body = form();
    const fetch = vi.fn().mockResolvedValueOnce(Response.json(envelope)).mockResolvedValueOnce(redirect("https://file-api.dooray.com/upload")).mockResolvedValueOnce(Response.json(envelope)); vi.stubGlobal("fetch", fetch);
    const c = http();
    expect(await c.upload("wapi/files", body)).toEqual(envelope);
    expect(await c.upload("wapi/files", body, { headers: { "Content-Type": "multipart/form-data", Authorization: "drop" } })).toEqual(envelope);
    for (const [, init] of fetch.mock.calls) {
      expect(init.body).toBe(body); expect(init.method).toBe("POST"); expect(init.redirect).toBe("manual");
      expect(new Headers(init.headers).get("Cookie")).toBe("SESSION=" + cookie);
      expect(new Headers(init.headers).has("Content-Type")).toBe(false);
      expect(new Headers(init.headers).has("Authorization")).toBe(false);
    }
  });
  it("바이트·업로드의 200 실패 JSON 과 403 을 공통 오류로 바꾼다", async () => {
    const fetch = vi.fn(async () => Response.json({ ...envelope, header: { isSuccessful: false, resultCode: 400, resultMessage: `bad ${cookie} ${origin}` } })); vi.stubGlobal("fetch", fetch);
    const error = await http().requestBytes("wapi/files").catch((e: Error) => e);
    expect(error).toMatchObject({ exitCode: 1 }); expect((error as Error).message).not.toContain(cookie); expect((error as Error).message).not.toContain("my-org");
    await expect(http().upload("wapi/files", form())).rejects.toMatchObject({ exitCode: 1 });
    fetch.mockImplementation(async () => new Response(null, { status: 403 }));
    await expect(http().upload("wapi/files", form())).rejects.toMatchObject({ exitCode: 2, message: expect.stringContaining("권한") });
  });
  it("다운로드의 파일 서버 응답 헤더에 시간 제한을 건다", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockResolvedValueOnce(redirect("https://file-api.dooray.com/file")).mockImplementationOnce(async (_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(new Error("aborted")))));
    vi.stubGlobal("fetch", fetch);
    const result = expect(http().requestBytes("wapi/files")).rejects.toMatchObject({ exitCode: 1, message: expect.stringContaining("30초") });
    await vi.advanceTimersByTimeAsync(30001); await result;
  });
  it("업로드에는 다운로드의 응답 시간 제한을 걸지 않는다", async () => {
    vi.useFakeTimers(); let finish!: (response: Response) => void;
    const fetch = vi.fn(async (_url: string, _init: RequestInit) => new Promise<Response>((resolve) => { finish = resolve; })); vi.stubGlobal("fetch", fetch);
    const result = http().upload("wapi/files", form());
    await vi.advanceTimersByTimeAsync(30001);
    expect(fetch.mock.calls[0][1].signal).toBeUndefined();
    finish(Response.json(envelope)); expect(await result).toEqual(envelope);
  });
});
