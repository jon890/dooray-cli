import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveMemberGroup, fetchAllMemberGroups } from "./member-group.js";
import type { DoorayApiClient } from "../api/client.js";
import { DoorayCliError } from "../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../utils/exit-codes.js";

vi.mock("../cache/store.js", () => ({
  getMemberGroups: vi.fn().mockResolvedValue(null),
  setMemberGroups: vi.fn().mockResolvedValue(undefined),
  isExpired: vi.fn().mockReturnValue(true),
}));

function mockClient(result: unknown): DoorayApiClient {
  return {
    getProjectMemberGroups: vi.fn().mockResolvedValue({ result, totalCount: (result as unknown[]).flat().length }),
  } as unknown as DoorayApiClient;
}

// fixture — 정규화 후 평면 (cache 거친 상태)
const fixtureFlat = [
  { id: "1111222233334444555", code: "all" },
  { id: "2222333344445555666", code: "개발" },
  { id: "3333444455556666777", code: undefined },
  { id: "4444555566667777888", code: "" },
];

beforeEach(() => vi.clearAllMocks());

// ─── fetchAllMemberGroups — flatten 멱등성 ───────────────

describe("fetchAllMemberGroups response shape normalization", () => {
  it("nested array 응답을 flatten 해서 처리", async () => {
    const nestedResult = [
      [
        { id: "1111222233334444555", code: "all", project: {}, createdAt: "", updatedAt: "" },
        { id: "2222333344445555666", code: "개발", project: {}, createdAt: "", updatedAt: "" },
      ],
    ];
    const client = {
      getProjectMemberGroups: vi.fn().mockResolvedValue({ result: nestedResult, totalCount: 2 }),
    } as unknown as DoorayApiClient;

    const result = await fetchAllMemberGroups(client, "proj");
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ id: "1111222233334444555", code: "all" });
    expect(result[1]).toEqual({ id: "2222333344445555666", code: "개발" });
  });

  it("평면 배열 응답도 정상 처리 (멱등성)", async () => {
    const flatResult = [
      { id: "1111222233334444555", code: "all", project: {}, createdAt: "", updatedAt: "" },
      { id: "2222333344445555666", code: "개발", project: {}, createdAt: "", updatedAt: "" },
    ];
    const client = {
      getProjectMemberGroups: vi.fn().mockResolvedValue({ result: flatResult, totalCount: 2 }),
    } as unknown as DoorayApiClient;

    const result = await fetchAllMemberGroups(client, "proj");
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ id: "1111222233334444555", code: "all" });
    expect(result[1]).toEqual({ id: "2222333344445555666", code: "개발" });
  });
});

// ─── resolveMemberGroup ───────────────────────────────────

describe("resolveMemberGroup", () => {
  it("code 부분일치 — 한글 code", async () => {
    const client = mockClient(fixtureFlat);
    const result = await resolveMemberGroup(client, "p1", "개발");
    expect(result).toEqual({ id: "2222333344445555666", code: "개발" });
  });

  it("id 직접 입력 — 정상 그룹", async () => {
    const client = mockClient(fixtureFlat);
    const result = await resolveMemberGroup(client, "p1", "1111222233334444555");
    expect(result).toEqual({ id: "1111222233334444555", code: "all" });
  });

  it("id 직접 입력 — code 누락 그룹도 매칭 (response shape robustness)", async () => {
    const client = mockClient(fixtureFlat);
    const result = await resolveMemberGroup(client, "p1", "3333444455556666777");
    expect(result.id).toBe("3333444455556666777");
    expect(result.code).toBe("");
  });

  it("id 매칭 실패 — 친절한 안내 + EXIT_PARAM_ERROR", async () => {
    const client = mockClient(fixtureFlat);
    await expect(resolveMemberGroup(client, "p1", "9999999999999999999")).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof DoorayCliError &&
        err.exitCode === EXIT_PARAM_ERROR &&
        /그룹 id 를 찾을 수 없습니다.*dooray project groups/s.test(err.message),
    );
  });

  it("code 매칭 실패 시 helpHint 에 id 입력 안내 포함", async () => {
    const client = mockClient(fixtureFlat);
    await expect(resolveMemberGroup(client, "p1", "존재하지않는code")).rejects.toThrow(
      /dooray project groups|id 직접 입력/,
    );
  });
});
