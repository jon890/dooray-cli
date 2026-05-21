import { describe, it, expect, vi, beforeEach } from "vitest";
import type { WikiComment } from "../api/types.js";
import { formatWikiCommentDetail, formatWikiCommentList } from "./wiki-comment.js";

const fixture: WikiComment = {
  id: "3950295078642684620",
  page: { id: "3521165468947041024" },
  createdAt: "2024-12-03T17:51:10+09:00",
  modifiedAt: "2024-12-03T17:51:10+09:00",
  creator: { type: "member", member: { organizationMemberId: "u1", name: "홍길동" } },
  body: { mimeType: "text/x-markdown", content: "테스트 댓글 본문" },
};

describe("formatWikiCommentDetail", () => {
  let writes: string[];
  beforeEach(() => {
    writes = [];
    vi.spyOn(process.stdout, "write").mockImplementation((s: any) => {
      writes.push(String(s));
      return true;
    });
  });

  it("table 모드 — 핵심 필드 모두 표시", () => {
    formatWikiCommentDetail(fixture, {});
    const joined = writes.join("");
    expect(joined).toContain("ID:");
    expect(joined).toContain("홍길동");
    expect(joined).toContain("테스트 댓글 본문");
  });

  it("--json 모드 — raw 객체 JSON 출력", () => {
    formatWikiCommentDetail(fixture, { json: true });
    const parsed = JSON.parse(writes.join(""));
    expect(parsed.id).toBe(fixture.id);
  });

  it("--quiet 모드 — ID 만 출력", () => {
    formatWikiCommentDetail(fixture, { quiet: true });
    expect(writes.join("").trim()).toBe(fixture.id);
  });
});
