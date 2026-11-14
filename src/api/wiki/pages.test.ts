import { describe, expect, it, vi } from "vitest";
import { collectWikiPages } from "./pages.js";
import type { WikiClient, WikiPage } from "./types.js";

// 부모 id → 자식 목록. 키가 없으면 자식이 없다. 루트는 "" 로 둔다.
function fakeClient(tree: Record<string, string[]>) {
  const getWikiPages = vi.fn(async (_wikiId: string, parentPageId?: string) => ({
    header: { isSuccessful: true, resultCode: 0, resultMessage: "" },
    result: (tree[parentPageId ?? ""] ?? []).map((id) => ({ id }) as WikiPage),
  }));
  return { client: { getWikiPages } as unknown as WikiClient, getWikiPages };
}

describe("collectWikiPages", () => {
  const tree = { "": ["a", "b"], a: ["a1", "a2"], b: ["b1"], a1: ["a11"] };

  it("깊이 순서로 모으고 레벨 안 순서를 보존한다", async () => {
    const { client } = fakeClient(tree);
    expect((await collectWikiPages(client, "w")).map((p) => p.id)).toEqual(["a", "b", "a1", "a2", "b1", "a11"]);
  });

  it("maxDepth 를 주면 그 깊이까지만 내려간다", async () => {
    const { client, getWikiPages } = fakeClient(tree);
    expect((await collectWikiPages(client, "w", 1)).map((p) => p.id)).toEqual(["a", "b"]);
    // 깊이 1 에서 멈추면 자식을 더 조회하지 않는다 (루트 조회 한 번뿐).
    expect(getWikiPages).toHaveBeenCalledTimes(1);
    expect((await collectWikiPages(client, "w", 2)).map((p) => p.id)).toEqual(["a", "b", "a1", "a2", "b1"]);
  });

  it("빈 위키는 빈 목록이다", async () => {
    const { client } = fakeClient({});
    expect(await collectWikiPages(client, "w")).toEqual([]);
  });

  it("한 레벨의 자식 조회는 동시에 10건까지만 보낸다", async () => {
    const siblings = Array.from({ length: 25 }, (_, i) => `p${i}`);
    let running = 0;
    let peak = 0;
    const getWikiPages = vi.fn(async (_wikiId: string, parentPageId?: string) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 1));
      running--;
      const ids = parentPageId === undefined ? siblings : [];
      return { header: { isSuccessful: true, resultCode: 0, resultMessage: "" }, result: ids.map((id) => ({ id }) as WikiPage) };
    });
    const pages = await collectWikiPages({ getWikiPages } as unknown as WikiClient, "w");
    expect(pages.map((p) => p.id)).toEqual(siblings);
    expect(peak).toBe(10);
  });
});
