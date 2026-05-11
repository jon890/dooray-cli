import { describe, it, expect } from "vitest";
import { parseUserSpec, mergeUsers } from "./post-users.js";
import type { CreatePostUser } from "../api/types.js";

describe("parseUserSpec", () => {
  it("멤버 id 들을 type:member 객체로 변환", () => {
    expect(parseUserSpec(["m1", "m2"], [])).toEqual([
      { type: "member", member: { organizationMemberId: "m1" } },
      { type: "member", member: { organizationMemberId: "m2" } },
    ]);
  });
  it("그룹 id 들을 type:group + projectMemberGroupId 로 변환", () => {
    expect(parseUserSpec([], ["g1"])).toEqual([
      { type: "group", group: { projectMemberGroupId: "g1", members: [] } },
    ]);
  });
  it("멤버 + 그룹 동시 — 멤버 먼저, 그룹 다음", () => {
    const out = parseUserSpec(["m1"], ["g1"]);
    expect(out[0]?.type).toBe("member");
    expect(out[1]?.type).toBe("group");
  });
});

describe("mergeUsers", () => {
  it("clear=false — 기존 + 신규 append, dedupe", () => {
    const existing: CreatePostUser[] = [{ type: "member", member: { organizationMemberId: "m1" } }];
    const additions: CreatePostUser[] = [
      { type: "member", member: { organizationMemberId: "m1" } }, // 중복
      { type: "member", member: { organizationMemberId: "m2" } },
    ];
    expect(mergeUsers(existing, additions, false)).toEqual([
      { type: "member", member: { organizationMemberId: "m1" } },
      { type: "member", member: { organizationMemberId: "m2" } },
    ]);
  });
  it("clear=true — 기존 무시, 신규만", () => {
    const existing: CreatePostUser[] = [{ type: "member", member: { organizationMemberId: "m1" } }];
    const additions: CreatePostUser[] = [{ type: "member", member: { organizationMemberId: "m2" } }];
    expect(mergeUsers(existing, additions, true)).toEqual(additions);
  });
  it("group dedupe — projectMemberGroupId 기준", () => {
    const existing: CreatePostUser[] = [{ type: "group", group: { projectMemberGroupId: "g1", members: [] } }];
    const additions: CreatePostUser[] = [{ type: "group", group: { projectMemberGroupId: "g1", members: [] } }];
    expect(mergeUsers(existing, additions, false).length).toBe(1);
  });
  it("emailUser dedupe — emailAddress 기준", () => {
    const existing: CreatePostUser[] = [{ type: "emailUser", emailUser: { emailAddress: "a@b.com", name: "A" } }];
    const additions: CreatePostUser[] = [{ type: "emailUser", emailUser: { emailAddress: "a@b.com", name: "A2" } }];
    expect(mergeUsers(existing, additions, false).length).toBe(1);
  });
});
