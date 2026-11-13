import { afterEach, describe, expect, it, vi } from "vitest";
import type { MemberDetail, MemberOrganization } from "../api/types.js";
import { formatMemberDetail } from "./member.js";

const member: MemberDetail = {
  id: "1111111111111111111",
  name: "홍길동",
  userCode: "hong",
  externalEmailAddress: "user@example.com",
};

const organization: MemberOrganization = {
  defaultOrganization: { id: "2222222222222222222", name: "두레이" },
  primaryDepartment: { id: null, name: "플랫폼개발팀" },
  positionName: "선임",
};

function capture(fn: () => void): string {
  const written: string[] = [];
  const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    written.push(String(chunk));
    return true;
  });
  try {
    fn();
  } finally {
    spy.mockRestore();
  }
  return written.join("");
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("formatMemberDetail 일반 출력", () => {
  it("소속 정보가 없으면 기존 줄만 낸다", () => {
    const out = capture(() => formatMemberDetail(member, {}));

    expect(out).toBe(
      "이름: 홍길동\n사번/ID: hong\n외부 이메일: user@example.com\nmember-id: 1111111111111111111\n",
    );
  });

  it("소속 정보를 주면 회사·부서·직책 줄을 member-id 앞에 낸다", () => {
    const out = capture(() => formatMemberDetail(member, {}, organization));

    expect(out).toBe(
      "이름: 홍길동\n사번/ID: hong\n외부 이메일: user@example.com\n" +
        "회사: 두레이\n부서: 플랫폼개발팀\n직책: 선임\nmember-id: 1111111111111111111\n",
    );
  });

  it("값이 없는 항목은 줄을 만들지 않는다", () => {
    const out = capture(() =>
      formatMemberDetail(member, {}, {
        defaultOrganization: { id: "2222222222222222222", name: "두레이" },
        primaryDepartment: { id: null, name: null },
        positionName: null,
      }),
    );

    expect(out).toContain("회사: 두레이\n");
    expect(out).not.toContain("부서:");
    expect(out).not.toContain("직책:");
  });
});

describe("formatMemberDetail --json", () => {
  it("소속 정보가 없으면 응답을 그대로 낸다", () => {
    const out = capture(() => formatMemberDetail(member, { json: true }));

    expect(JSON.parse(out)).toEqual(member);
  });

  it("소속 정보를 주면 organization 키를 더한다", () => {
    const out = capture(() => formatMemberDetail(member, { json: true }, organization));

    expect(JSON.parse(out)).toEqual({ ...member, organization });
  });
});
