import { describe, it, expect } from "vitest";
import { buildMemberMention, buildGroupMention, prependMentions } from "./mention.js";

const ME = { id: "100", name: "본인", orgId: "1" };

describe("buildMemberMention", () => {
  it("본인이면 me title", () => {
    expect(buildMemberMention({ memberId: "100", name: "본인" }, ME))
      .toBe('[@본인](dooray://1/members/100 "me")');
  });
  it("타인이면 member title", () => {
    expect(buildMemberMention({ memberId: "200", name: "홍길동" }, ME))
      .toBe('[@홍길동](dooray://1/members/200 "member")');
  });
});

describe("buildGroupMention", () => {
  it("project/code 형식 + title 없음", () => {
    expect(buildGroupMention({ groupId: "g1", code: "개발", projectCode: "P" }, ME))
      .toBe("[@P/개발](dooray://1/member-groups/g1)");
  });
});

describe("prependMentions", () => {
  it("본문 앞에 prepend, 공백 구분", () => {
    const out = prependMentions(
      "확인 부탁드립니다",
      [{ memberId: "200", name: "홍길동" }],
      [{ groupId: "g1", code: "개발", projectCode: "P" }],
      ME,
    );
    expect(out).toBe(
      '[@홍길동](dooray://1/members/200 "member") [@P/개발](dooray://1/member-groups/g1) 확인 부탁드립니다',
    );
  });
  it("멘션 없으면 본문 그대로", () => {
    expect(prependMentions("본문", [], [], ME)).toBe("본문");
  });
  it("빈 본문 + 멘션만 → trailing 공백", () => {
    expect(prependMentions("", [{ memberId: "200", name: "A" }], [], ME))
      .toBe('[@A](dooray://1/members/200 "member") ');
  });
  it("멤버만 또는 그룹만도 동작", () => {
    expect(prependMentions("X", [{ memberId: "100", name: "본인" }], [], ME))
      .toBe('[@본인](dooray://1/members/100 "me") X');
    expect(prependMentions("X", [], [{ groupId: "g1", code: "개발", projectCode: "P" }], ME))
      .toBe("[@P/개발](dooray://1/member-groups/g1) X");
  });
  it("순서: 멤버 먼저, 그룹 다음", () => {
    const out = prependMentions(
      "X",
      [{ memberId: "200", name: "A" }, { memberId: "300", name: "B" }],
      [{ groupId: "g1", code: "개발", projectCode: "P" }],
      ME,
    );
    expect(out.indexOf("members/200") < out.indexOf("members/300")).toBe(true);
    expect(out.indexOf("members/300") < out.indexOf("member-groups/g1")).toBe(true);
  });
});
