import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient } from "./dooray-client.js";
import { DoorayApiClient } from "./client.js";
const base = { version: 1 as const, apiKey: "fake-key", baseUrl: "https://api.dooray.com" };
afterEach(() => vi.unstubAllGlobals());
describe("인증 방식 선택", () => {
  it("방식이 없거나 api-key 면 기존 공개 클라이언트다", () => {
    expect(createClient(base)).toBeInstanceOf(DoorayApiClient);
    expect(createClient({ ...base, authMode: "api-key" })).toBeInstanceOf(DoorayApiClient);
  });
  it("웹 설정이면 별도 웹 주소를 부르고 Promise 로 오인되지 않는다", async () => {
    const fetch = vi.fn(async (_request: Request) => Response.json({ header: { isSuccessful: true, resultCode: 0, resultMessage: "" }, result: { content: { id: "member-1", name: "홍길동", defaultOrganizationId: "org-1" } } }));
    vi.stubGlobal("fetch", fetch);
    const client = createClient({ ...base, authMode: "web", tenantName: "my-org", sessionCookie: "fake-session" });
    expect(await Promise.resolve(client)).toBe(client);
    expect(Reflect.get(client, "then")).toBeUndefined();
    await client.getMe();
    expect(fetch.mock.calls[0][0].url).toBe("https://my-org.dooray.com/v2/wapi/members/me");
  });
  it.each([undefined, "example", "my-org.other"])("주소가 불명확하면 요청 전에 설정 오류다", (tenantName) => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    expect(() => createClient({ ...base, authMode: "web", tenantName, sessionCookie: "fake-session" })).toThrow(expect.objectContaining({ exitCode: 4 }));
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(["getPosts", "getWikis", "getMessengerChannels", "getCalendars", "getStreams"])("미지원 영역의 %s 는 공개 API 로 빠지지 않는다", async (method) => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const client = createClient({ ...base, authMode: "web", tenantName: "my-org", sessionCookie: "fake-session" });
    const call = Reflect.get(client, method) as (...args: unknown[]) => Promise<unknown>;
    await expect(call("project")).rejects.toMatchObject({ exitCode: 3, message: expect.stringContaining("웹 방식에서는 지원하지 않습니다") });
    expect(fetch).not.toHaveBeenCalled();
  });
});
