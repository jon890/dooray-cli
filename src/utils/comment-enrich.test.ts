import { describe, it, expect } from "vitest";
import { enrichCommentCreators } from "./comment-enrich.js";
import type { PostComment } from "../api/types.js";

function makeComment(opts: { id: string; memberId?: string; name?: string }): PostComment {
  return {
    id: opts.id,
    post: { id: "p1" },
    type: "log", subtype: "comment",
    createdAt: "2026-04-27T00:00:00Z",
    creator: opts.memberId
      ? { type: "member", member: { organizationMemberId: opts.memberId, ...(opts.name && { name: opts.name }) } }
      : { type: "system" },
    body: { mimeType: "text/x-markdown", content: "" },
  };
}

describe("enrichCommentCreators", () => {
  it("name 비어있고 nameMap hit → 채움", () => {
    const map = new Map([["m1", "홍길동"]]);
    const out = enrichCommentCreators([makeComment({ id: "c1", memberId: "m1" })], map);
    expect(out[0].creator.member?.name).toBe("홍길동");
  });
  it("name 이미 있으면 변경 안 함", () => {
    const map = new Map([["m1", "다른이름"]]);
    const out = enrichCommentCreators([makeComment({ id: "c1", memberId: "m1", name: "원래이름" })], map);
    expect(out[0].creator.member?.name).toBe("원래이름");
  });
  it("nameMap miss → 변경 안 함 (name 비어있음 그대로)", () => {
    const map = new Map<string, string>();
    const out = enrichCommentCreators([makeComment({ id: "c1", memberId: "m1" })], map);
    expect(out[0].creator.member?.name).toBeUndefined();
  });
  it("creator.member 없음 (system 등) → 변경 안 함", () => {
    const map = new Map([["m1", "홍길동"]]);
    const out = enrichCommentCreators([makeComment({ id: "c1" })], map);
    expect(out[0]).toEqual(makeComment({ id: "c1" }));
  });
  it("원본 배열 mutation 없음", () => {
    const map = new Map([["m1", "홍길동"]]);
    const original = [makeComment({ id: "c1", memberId: "m1" })];
    enrichCommentCreators(original, map);
    expect(original[0].creator.member?.name).toBeUndefined();
  });
});
