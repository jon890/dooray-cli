import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient } from "./dooray-client.js";
import { DoorayApiClient } from "./client.js";
import { DoorayWebClient } from "./web/index.js";
const base = { version: 1 as const, apiKey: "fake-key", baseUrl: "https://api.dooray.com" };
afterEach(() => vi.unstubAllGlobals());
describe("인증 방식 선택", () => {
  it("방식이 없거나 api-key 면 기존 공개 클라이언트다", () => {
    expect(createClient(base)).toBeInstanceOf(DoorayApiClient);
    expect(createClient({ ...base, authMode: "api-key" })).toBeInstanceOf(DoorayApiClient);
  });
  it("웹 설정으로 별도 웹 클라이언트를 만든다", () => {
    expect(createClient({ ...base, authMode: "web", tenantName: "my-org", sessionCookie: "fake-session" })).toBeInstanceOf(DoorayWebClient);
  });
  it.each([undefined, "example", "my-org.other"])("주소가 불명확하면 요청 전에 설정 오류다", (tenantName) => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    expect(() => createClient({ ...base, authMode: "web", tenantName, sessionCookie: "fake-session" })).toThrow(expect.objectContaining({ exitCode: 4 }));
    expect(fetch).not.toHaveBeenCalled();
  });
  it("아직 옮기지 않은 메서드는 공개 API 로 빠지지 않는다", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const client = createClient({ ...base, authMode: "web", tenantName: "my-org", sessionCookie: "fake-session" });
    await expect(client.getPosts("project")).rejects.toMatchObject({ exitCode: 3, message: expect.stringContaining("웹 방식에서는 지원하지 않습니다") });
    expect(fetch).not.toHaveBeenCalled();
  });
});
