import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchAllWikis, filterWikisByName, resolveTargetWikiId, resolveWiki } from "./wiki.js";
import { getProjects, getPrivateProjects, isExpired } from "../cache/store.js";
import type { DoorayApiClient } from "../api/client.js";
import type { Wiki } from "@/api/wiki/types.js";
import { EXIT_PARAM_ERROR } from "../utils/exit-codes.js";

vi.mock("../cache/store.js", () => ({
  getProjects: vi.fn().mockResolvedValue({ data: [], updatedAt: new Date(0).toISOString() }),
  setProjects: vi.fn().mockResolvedValue(undefined),
  getPrivateProjects: vi.fn().mockResolvedValue(null),
  setPrivateProjects: vi.fn().mockResolvedValue(undefined),
  isExpired: vi.fn().mockReturnValue(true),
  getWikis: vi.fn().mockResolvedValue(null),
  setWikis: vi.fn().mockResolvedValue(undefined),
}));

function wiki(overrides: Partial<Wiki> & Pick<Wiki, "id" | "name">): Wiki {
  return {
    project: { id: "p-1" },
    type: "public",
    scope: "public",
    home: { pageId: "home-1" },
    ...overrides,
  };
}

function mockClient(getWikis: (p: any) => Promise<any>): DoorayApiClient {
  return {
    getWikis: vi.fn(getWikis),
  } as unknown as DoorayApiClient;
}

describe("fetchAllWikis", () => {
  it("totalCount 가 250 이면 getWikis 를 세 번 불러 250건을 모두 모은다", async () => {
    const getWikis = vi.fn(async (p: { page: number; size: number }) => {
      const remaining = 250 - p.page * p.size;
      const count = Math.min(p.size, Math.max(remaining, 0));
      const result = Array.from({ length: count }, (_, i) =>
        wiki({ id: `w-${p.page * p.size + i}`, name: `Wiki ${p.page * p.size + i}` }),
      );
      return { result, totalCount: 250 };
    });
    const client = { getWikis } as unknown as DoorayApiClient;

    const all = await fetchAllWikis(client);

    expect(getWikis).toHaveBeenCalledTimes(3);
    expect(all).toHaveLength(250);
  });

  it("totalCount 가 0 이면 빈 배열을 돌려주고 두 번째 호출을 하지 않는다", async () => {
    const client = mockClient(async () => ({ result: [], totalCount: 0 }));

    const all = await fetchAllWikis(client);

    expect(all).toEqual([]);
    expect(client.getWikis).toHaveBeenCalledTimes(1);
  });

  it("totalCount 없이 빈 result 를 받으면 그 자리에서 멈춘다", async () => {
    const client = mockClient(async () => ({ result: [] }));

    const all = await fetchAllWikis(client);

    expect(all).toEqual([]);
    expect(client.getWikis).toHaveBeenCalledTimes(1);
  });
});

describe("resolveWiki", () => {
  // 확인마다 캐시 mock 의 반환값을 바꾸므로 시작값을 여기서 되돌린다
  beforeEach(() => {
    vi.mocked(isExpired).mockReturnValue(true);
    vi.mocked(getProjects).mockResolvedValue({ data: [], updatedAt: new Date(0).toISOString() });
    vi.mocked(getPrivateProjects).mockResolvedValue(null);
  });

  function mockProjectClient(): DoorayApiClient {
    return {
      getProjects: vi.fn().mockResolvedValue({ result: [], totalCount: 0 }),
    } as unknown as DoorayApiClient;
  }

  it("15자리 이상 numeric(orgId) 을 찾지 못하면 orgId 안내와 wiki page get --id 를 담는다", async () => {
    const orgId = "1234567890123456789";
    await expect(resolveWiki(mockProjectClient(), orgId)).rejects.toMatchObject({
      exitCode: EXIT_PARAM_ERROR,
      message: expect.stringContaining("orgId"),
    });
    await expect(resolveWiki(mockProjectClient(), orgId)).rejects.toMatchObject({
      message: expect.stringContaining("wiki page get --id"),
    });
  });

  it("공용 캐시에 없고 private 캐시에 있으면 그 wikiId 를 돌려준다", async () => {
    vi.mocked(isExpired).mockReturnValue(false);
    vi.mocked(getProjects).mockResolvedValue({ data: [], updatedAt: new Date().toISOString() });
    vi.mocked(getPrivateProjects).mockResolvedValue({
      data: [{ id: "3333444455556666777", code: "@my-account", wikiId: "wiki-9" }],
      updatedAt: new Date().toISOString(),
    });

    await expect(resolveWiki(mockProjectClient(), "@my-account")).resolves.toBe("wiki-9");
  });

  it("projectId 를 직접 넣고 private 캐시가 비어 있으면 목록을 받아 wikiId 를 찾는다", async () => {
    vi.mocked(isExpired).mockReturnValue(false);
    vi.mocked(getProjects).mockResolvedValue({ data: [], updatedAt: new Date().toISOString() });
    vi.mocked(getPrivateProjects).mockResolvedValue(null);
    const projectId = "3333444455556666777";
    const client = {
      getProjects: vi.fn().mockResolvedValue({
        result: [{ id: projectId, code: "@my-account", wiki: { id: "wiki-9" } }],
        totalCount: 1,
      }),
    } as unknown as DoorayApiClient;

    await expect(resolveWiki(client, projectId)).resolves.toBe("wiki-9");
    expect(client.getProjects).toHaveBeenCalledWith(
      expect.objectContaining({ type: "private" }),
    );
  });

  it("비숫자 project 코드를 찾지 못하면 orgId 안내를 붙이지 않는다", async () => {
    await expect(resolveWiki(mockProjectClient(), "not-found-project")).rejects.toMatchObject({
      exitCode: EXIT_PARAM_ERROR,
    });
    try {
      await resolveWiki(mockProjectClient(), "not-found-project");
      throw new Error("resolveWiki 가 던지지 않았다");
    } catch (e: any) {
      expect(e.message).not.toContain("orgId");
    }
  });
});

describe("filterWikisByName", () => {
  const wikis = [wiki({ id: "w-1", name: "Design Wiki" }), wiki({ id: "w-2", name: "Backend Docs" })];

  it("대소문자를 무시한다", () => {
    const filtered = filterWikisByName(wikis, "design");
    expect(filtered.map((w) => w.id)).toEqual(["w-1"]);
  });

  it("부분 일치를 본다", () => {
    const filtered = filterWikisByName(wikis, "gn wi");
    expect(filtered.map((w) => w.id)).toEqual(["w-1"]);
  });

  it("걸리지 않는 항목을 뺀다", () => {
    const filtered = filterWikisByName(wikis, "존재하지않는키워드");
    expect(filtered).toEqual([]);
  });

  // 빈 키워드는 입력을 그대로 돌려준다. 그래서 명령 쪽에서 빈 --search 를
  // 먼저 거부한다. 이 성질이 바뀌면 그 가드의 근거가 사라진다.
  it("빈 키워드는 입력을 그대로 돌려준다", () => {
    const filtered = filterWikisByName(wikis, "");
    expect(filtered.map((w) => w.id)).toEqual(["w-1", "w-2"]);
  });
});

describe("resolveTargetWikiId", () => {
  beforeEach(() => {
    vi.mocked(isExpired).mockReturnValue(false);
    vi.mocked(getProjects).mockResolvedValue({ data: [], updatedAt: new Date().toISOString() });
    vi.mocked(getPrivateProjects).mockResolvedValue(null);
  });

  it("프로젝트 id 꼴이면 조회 없이 그대로 wikiId 로 쓴다", async () => {
    const client = mockClient(async () => ({ result: [], totalCount: 0 }));
    await expect(resolveTargetWikiId(client, "1234567890123456789")).resolves.toBe("1234567890123456789");
    expect(client.getWikis).not.toHaveBeenCalled();
  });

  it("프로젝트 코드면 resolveWiki 처럼 풀어 그 프로젝트의 wikiId 를 돌려준다", async () => {
    vi.mocked(getProjects).mockResolvedValue({
      data: [{ id: "3333444455556666777", code: "sample-project", wikiId: "wiki-7" }],
      updatedAt: new Date().toISOString(),
    });
    const client = mockClient(async () => ({ result: [], totalCount: 0 }));
    await expect(resolveTargetWikiId(client, "sample-project")).resolves.toBe("wiki-7");
  });
});
