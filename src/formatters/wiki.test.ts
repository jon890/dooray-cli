import { describe, it, expect } from "vitest";
import type { WikiPage } from "../api/types.js";
import { buildWikiTree, renderWikiTree } from "./wiki.js";

function page(overrides: Partial<WikiPage> & Pick<WikiPage, "id" | "subject">): WikiPage {
  return {
    wikiId: "w-1",
    version: 1,
    root: false,
    creator: { type: "member", member: { organizationMemberId: "u1", name: "가상사용자" } },
    ...overrides,
  };
}

describe("buildWikiTree", () => {
  it("flat 배열을 부모-자식 트리로 조립한다 (root 1 + 자식 2 + 손자 1)", () => {
    const pages: WikiPage[] = [
      page({ id: "p-root", subject: "Home", root: true }),
      page({ id: "p-child-1", subject: "자식 A", parentPageId: "p-root" }),
      page({ id: "p-child-2", subject: "자식 B", parentPageId: "p-root" }),
      page({ id: "p-grandchild-1", subject: "손자 A", parentPageId: "p-child-1" }),
    ];

    const tree = buildWikiTree(pages);

    expect(tree).toHaveLength(1);
    expect(tree[0].page.id).toBe("p-root");
    expect(tree[0].children).toHaveLength(2);
    expect(tree[0].children.map((c) => c.page.id)).toEqual(["p-child-1", "p-child-2"]);
    expect(tree[0].children[0].children).toHaveLength(1);
    expect(tree[0].children[0].children[0].page.id).toBe("p-grandchild-1");
  });

  it("root: true 페이지가 여러 개면 최상단 노드도 여러 개다", () => {
    const pages: WikiPage[] = [
      page({ id: "p-root-1", subject: "Home 1", root: true }),
      page({ id: "p-root-2", subject: "Home 2", root: true }),
    ];

    const tree = buildWikiTree(pages);

    expect(tree).toHaveLength(2);
    expect(tree.map((n) => n.page.id)).toEqual(["p-root-1", "p-root-2"]);
  });

  it("parentPageId 가 배열 내 어떤 id 와도 매칭 안 되면 루트로 승격한다", () => {
    const pages: WikiPage[] = [
      page({ id: "p-root", subject: "Home", root: true }),
      page({ id: "p-orphan", subject: "고아 페이지", parentPageId: "p-missing" }),
    ];

    const tree = buildWikiTree(pages);

    expect(tree).toHaveLength(2);
    expect(tree.map((n) => n.page.id)).toEqual(["p-root", "p-orphan"]);
  });

  it("빈 배열 입력 시 빈 배열을 반환한다", () => {
    expect(buildWikiTree([])).toEqual([]);
  });
});

describe("renderWikiTree", () => {
  it("형제 중 마지막이 아니면 ├─, 마지막이면 └─ 커넥터를 쓴다", () => {
    const pages: WikiPage[] = [
      page({ id: "p-root", subject: "Home", root: true }),
      page({ id: "p-child-1", subject: "자식 A", parentPageId: "p-root" }),
      page({ id: "p-child-2", subject: "자식 B", parentPageId: "p-root" }),
    ];

    const rendered = renderWikiTree(buildWikiTree(pages));
    const lines = rendered.split("\n");

    expect(lines[1]).toMatch(/├─자식 A/);
    expect(lines[2]).toMatch(/└─자식 B/);
  });

  it("각 라인에 (<id>) 가 노출된다", () => {
    const pages: WikiPage[] = [page({ id: "p-root", subject: "Home", root: true })];

    const rendered = renderWikiTree(buildWikiTree(pages));

    expect(rendered).toContain("(p-root)");
  });

  it("subject 에 개행이 있어도 한 줄로 정규화해 트리 구조를 깨지 않는다", () => {
    const pages: WikiPage[] = [
      page({ id: "p-root", subject: "제목\n줄바꿈", root: true }),
    ];

    const rendered = renderWikiTree(buildWikiTree(pages));

    expect(rendered.split("\n")).toHaveLength(1);
    expect(rendered).toContain("제목 줄바꿈");
  });
});
