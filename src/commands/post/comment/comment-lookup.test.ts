import { describe, expect, it, vi } from "vitest";
import type { MemberClient } from "@/api/member/types.js";
import type { PostComment } from "@/api/post/types.js";

const mocks = vi.hoisted(() => ({ buildMemberNameMap: vi.fn() }));
vi.mock("../../../resolvers/member.js", () => ({ buildMemberNameMap: mocks.buildMemberNameMap }));

import { withCreatorNames } from "./comment-lookup.js";

const comment = {
  id: "c-1",
  creator: { type: "member", member: { organizationMemberId: "m-1" } },
} as unknown as PostComment;

describe("withCreatorNames", () => {
  it("이름 조회에 성공하면 작성자 이름을 채운다", async () => {
    mocks.buildMemberNameMap.mockResolvedValue(new Map([["m-1", "홍길동"]]));
    const result = await withCreatorNames({} as MemberClient, "p-1", comment);
    expect(result.creator?.member?.name).toBe("홍길동");
  });

  it("이름 조회가 실패해도 댓글은 돌려준다", async () => {
    mocks.buildMemberNameMap.mockRejectedValue(new Error("network"));
    const result = await withCreatorNames({} as MemberClient, "p-1", comment);
    expect(result.id).toBe("c-1");
  });
});
