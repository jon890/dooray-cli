import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createWebClient } from "../web/index.js";
const fixtures = JSON.parse(readFileSync(new URL("../web/fixtures/member/responses.json", import.meta.url), "utf8"));
const client = () => createWebClient("fake-session", "https://my-org.dooray.com");
afterEach(() => vi.unstubAllGlobals());
describe("웹 멤버 공식 응답 변환", () => {
  it("me 의 기본 조직과 공개 상세 필드를 변환한다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(fixtures.me)));
    const result = (await client().getMe()).result;
    expect(result.defaultOrganization).toEqual({ id: "2222333344445555666" });
    expect(result).toMatchObject({ id: "1234567890123456789", idProviderType: "service", locale: "ko_KR", englishName: "Test User" });
    expect(result).not.toHaveProperty("sessionCheckedAt");
    expect(result).not.toHaveProperty("displayMemberId");
  });
  it("기본 조직을 얻지 못하면 조용히 누락하지 않는다", async () => {
    const fixture = structuredClone(fixtures.me);
    delete fixture.result.content.defaultOrganization;
    delete fixture.result.content.defaultOrganizationId;
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(fixture)));
    await expect(client().getMe()).rejects.toMatchObject({ exitCode: 1 });
  });
  it("멤버 상세도 content 를 꺼낸다", async () => {
    const mock = vi.fn(async () => Response.json(fixtures.me)); vi.stubGlobal("fetch", mock);
    expect((await client().getMemberDetail("member/id")).result.name).toBe("홍길동");
    expect((mock.mock.calls as unknown[][])[0][0]).toMatchObject({ url: expect.stringContaining("member%2Fid") });
  });
  it("프로젝트 멤버 totalCount 를 보존하고 상세 재조회 없이 이름을 재사용한다", async () => {
    const mock = vi.fn(async () => Response.json(fixtures.projectMembers)); vi.stubGlobal("fetch", mock);
    const c = client();
    const members = await c.getProjectMembers("project-1", { page: 1, size: 100 });
    expect(members.totalCount).toBe(101);
    expect(members.result).toEqual([{ organizationMemberId: "1234567890123456789", role: "admin" }]);
    expect((await c.getMemberDetail(members.result[0].organizationMemberId)).result).toEqual({ id: "1234567890123456789", name: "홍길동" });
    expect(mock).toHaveBeenCalledTimes(1);
  });
  it("검색 쿼리와 페이지를 전달하고 공식 목록 필드만 돌려준다", async () => {
    const mock = vi.fn(async () => Response.json(fixtures.search)); vi.stubGlobal("fetch", mock);
    const result = await client().searchMembers({ name: "홍길동", page: 1, size: 1, userCodeExact: "test-user", externalEmailAddresses: "user@example.com" });
    const request = (mock.mock.calls as unknown[][])[0][0] as Request;
    expect(new URL(request.url).searchParams.get("page")).toBe("1");
    expect(new URL(request.url).searchParams.get("externalEmailAddresses")).toBe("user@example.com");
    expect(result.totalCount).toBe(2);
    expect(result.result).toEqual([{ id: "1234567890123456789", name: "홍길동", userCode: "test-user", externalEmailAddress: "user@example.com" }]);
  });
});
