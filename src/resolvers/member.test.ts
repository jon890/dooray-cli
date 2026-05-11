import { describe, it, expect, vi } from "vitest";
import { resolveMember } from "./member.js";
import type { DoorayApiClient } from "../api/client.js";
import { DoorayCliError } from "../utils/errors.js";
import { EXIT_API_ERROR } from "../utils/exit-codes.js";

vi.mock("../cache/store.js", () => ({
  getMembers: vi.fn().mockResolvedValue(null),
  setMembers: vi.fn().mockResolvedValue(undefined),
  isExpired: vi.fn().mockReturnValue(true),
}));

function mockClient(opts: {
  getMemberDetail?: (id: string) => Promise<any>;
  searchMembers?: (p: any) => Promise<any>;
  getProjectMembers?: (...args: any[]) => Promise<any>;
}): DoorayApiClient {
  return {
    getMemberDetail: opts.getMemberDetail ?? vi.fn(),
    searchMembers: opts.searchMembers ?? vi.fn(),
    getProjectMembers:
      opts.getProjectMembers ??
      vi.fn().mockResolvedValue({ result: [], totalCount: 0 }),
  } as unknown as DoorayApiClient;
}

describe("resolveMember 입력 자동 분기", () => {
  it("15자리 이상 숫자 → getMemberDetail 호출 후 input 반환", async () => {
    const id = "1234567890123456789";
    const client = mockClient({
      getMemberDetail: vi
        .fn()
        .mockResolvedValue({ result: { id, name: "X" } }),
    });
    expect(await resolveMember(client, "proj", id)).toBe(id);
  });

  it("15자리 이상 숫자 + getMemberDetail 404 (DoorayCliError + EXIT_API_ERROR) → '찾을 수 없습니다' 메시지", async () => {
    // toDoorayCliError 가 404 HTTP 에러에 EXIT_API_ERROR 부여 — 실제 동작 mirror
    const client = mockClient({
      getMemberDetail: vi
        .fn()
        .mockRejectedValue(new DoorayCliError("API 호출 실패: not found", EXIT_API_ERROR)),
    });
    await expect(
      resolveMember(client, "proj", "1234567890123456789"),
    ).rejects.toThrow(/찾을 수 없습니다/);
  });

  it("15자리 이상 숫자 + 네트워크/5xx 에러 → 원본 에러 그대로 re-throw", async () => {
    const networkErr = new Error("ECONNREFUSED");
    const client = mockClient({
      getMemberDetail: vi.fn().mockRejectedValue(networkErr),
    });
    await expect(
      resolveMember(client, "proj", "1234567890123456789"),
    ).rejects.toBe(networkErr);
  });

  it("이메일 형식 → searchMembers 1건 시 id 반환", async () => {
    const client = mockClient({
      searchMembers: vi.fn().mockResolvedValue({
        result: [{ id: "9876543210987654321", name: "X" }],
        totalCount: 1,
      }),
    });
    expect(await resolveMember(client, "proj", "user@example.com")).toBe(
      "9876543210987654321",
    );
  });

  it("이메일 형식 + 0건 → '이메일로 멤버를 찾을 수 없습니다'", async () => {
    const client = mockClient({
      searchMembers: vi
        .fn()
        .mockResolvedValue({ result: [], totalCount: 0 }),
    });
    await expect(
      resolveMember(client, "proj", "missing@example.com"),
    ).rejects.toThrow(/이메일로 멤버를 찾을 수 없습니다/);
  });

  it("이메일 형식 + 2건 이상 → '이메일 매칭이 모호합니다' + 후보", async () => {
    const client = mockClient({
      searchMembers: vi.fn().mockResolvedValue({
        result: [
          { id: "1", name: "A" },
          { id: "2", name: "B" },
        ],
        totalCount: 2,
      }),
    });
    await expect(
      resolveMember(client, "proj", "dup@example.com"),
    ).rejects.toThrow(/이메일 매칭이 모호합니다.*A.*B/s);
  });

  it("이름 입력 (기존 matchByName 분기) → ensureMembers 경로 사용", async () => {
    const client = mockClient({
      getProjectMembers: vi.fn().mockResolvedValue({
        result: [{ organizationMemberId: "1234567890123456789" }],
        totalCount: 1,
      }),
      getMemberDetail: vi
        .fn()
        .mockResolvedValue({ result: { name: "홍길동" } }),
    });
    await expect(
      resolveMember(client, "proj", "홍길동"),
    ).resolves.toBeDefined();
  });
});
