import { afterEach, describe, expect, it, vi } from "vitest";
import { WebHttp } from "./web-http.js";

const origin = "https://my-org.dooray.com";
const cookie = "fake-session-secret";
const header = { isSuccessful: true, resultCode: 0, resultMessage: "" };
afterEach(() => vi.unstubAllGlobals());

describe("웹 요청의 비밀값 경계", () => {
  it("검사한 origin 에만 쿠키를 붙이고 Authorization 과 자동 리다이렉트를 쓰지 않는다", async () => {
    const requests: Request[] = [];
    vi.stubGlobal("fetch", vi.fn(async (request: Request) => { requests.push(request); return Response.json({ header, result: {} }); }));
    const http = new WebHttp(origin, cookie);
    await http.request("v2/wapi/members/me", { headers: { Authorization: "other" } });
    expect(requests[0].headers.get("cookie")).toBe(`SESSION=${cookie}`);
    expect(requests[0].headers.has("authorization")).toBe(false);
    expect(requests[0].redirect).toBe("manual");
    for (const input of [new URL("https://example.com/steal"), new Request("https://example.com/steal"), new URL("http://my-org.dooray.com/steal")]) {
      await expect(http.request(input)).rejects.toMatchObject({ exitCode: 1 });
    }
    expect(requests).toHaveLength(1);
  });
  it.each([
    [401, undefined, 2, "SESSION"],
    [403, undefined, 2, "권한"],
    [302, "/auth/signin?next=private", 2, "SESSION"],
    [302, "https://example.com/other", 1, "리다이렉트"],
  ] as const)("%s 응답을 구분하고 새 요청을 보내지 않는다", async (status, location, exitCode, text) => {
    const mock = vi.fn(async () => new Response("", { status, headers: location ? { Location: location } : undefined }));
    vi.stubGlobal("fetch", mock);
    const error = await new WebHttp(origin, cookie).request("v2/wapi/members/me").catch((e: unknown) => e);
    expect(error).toMatchObject({ exitCode, message: expect.stringContaining(text) });
    expect((error as Error).message).not.toContain(cookie);
    expect((error as Error).message).not.toContain(origin);
    if (status === 403) expect((error as Error).message).not.toContain("쿠키");
    expect(mock).toHaveBeenCalledTimes(1);
  });
  it("서버가 주소와 쿠키를 되돌려줘도 오류·실행 기록에 들어갈 메시지에서 가린다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ header: { ...header, isSuccessful: false, resultMessage: `bad ${cookie} ${origin}/path my-org.dooray.com` }, result: null })));
    const error = await new WebHttp(origin, cookie).request("bad").catch((e: Error) => e);
    expect(error).toMatchObject({ exitCode: 1 });
    expect((error as Error).message).not.toContain(cookie);
    expect((error as Error).message).not.toContain("my-org.dooray.com");
  });
  it.each(["<html>signin</html>", "{invalid", "null", "{}"])("JSON 과 응답 구조를 확인한다", async (body) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body)));
    await expect(new WebHttp(origin, cookie).request("bad")).rejects.toMatchObject({ exitCode: 1 });
  });
  it("네트워크 오류의 원문에 든 비밀값을 버린다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error(`${origin} ${cookie}`); }));
    const error = await new WebHttp(origin, cookie).request("bad", { retry: 0 }).catch((e: Error) => e);
    expect((error as Error).message).toContain("네트워크");
    expect((error as Error).message).not.toContain(cookie);
  });
  it("429 는 호출 한도 오류로 나눈다", async () => {
    const mock = vi.fn(async () => new Response("", { status: 429, headers: { "Retry-After": "0" } }));
    vi.stubGlobal("fetch", mock);
    await expect(new WebHttp(origin, cookie).request("bad")).rejects.toMatchObject({ exitCode: 6 });
    expect(mock).toHaveBeenCalledTimes(4);
  });
  it("타임아웃 안내에 요청 주소를 넣지 않는다", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
    await expect(new WebHttp(origin, cookie).request("slow", { timeout: 5, retry: 0 })).rejects.toMatchObject({ message: "웹 요청 시간이 초과됐습니다.", exitCode: 1 });
  });
  it("19자리 정수 ID 의 정밀도를 지킨다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ header, result: {} }).replace('"result":{}', '"result":{"id":1234567890123456789}'))));
    expect((await new WebHttp(origin, cookie).request("good")).result).toEqual({ id: "1234567890123456789" });
  });
});
