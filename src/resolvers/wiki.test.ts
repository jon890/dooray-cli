import { describe, it, expect, vi } from "vitest";
import { fetchAllWikis, filterWikisByName } from "./wiki.js";
import type { DoorayApiClient } from "../api/client.js";
import type { Wiki } from "../api/types.js";

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
});
