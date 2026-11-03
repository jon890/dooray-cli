import { describe, it, expect, vi } from "vitest";
import {
  buildOrganizationMemberNameMap,
  resolveMember,
  resolveMemberByIdOrEmail,
  resolveOrganizationMember,
} from "./member.js";
import type { DoorayApiClient } from "../api/client.js";
import { DoorayCliError } from "../utils/errors.js";
import { EXIT_API_ERROR, EXIT_PARAM_ERROR } from "../utils/exit-codes.js";

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
    ).rejects.toThrow(/복수의 멤버가 매칭됩니다\(이메일\).*A.*B/s);
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

describe("resolveMemberByIdOrEmail (messenger --to 공유 헬퍼)", () => {
  it("15자리 이상 숫자 → getMemberDetail 호출 후 input 반환", async () => {
    const id = "1234567890123456789";
    const client = mockClient({
      getMemberDetail: vi.fn().mockResolvedValue({ result: { id, name: "X" } }),
    });
    expect(await resolveMemberByIdOrEmail(client, id)).toBe(id);
  });

  it("이메일 형식 → searchMembers 1건 시 id 반환", async () => {
    const client = mockClient({
      searchMembers: vi.fn().mockResolvedValue({
        result: [{ id: "9876543210987654321", name: "X" }],
        totalCount: 1,
      }),
    });
    expect(
      await resolveMemberByIdOrEmail(client, "user@example.com"),
    ).toBe("9876543210987654321");
  });

  it("id/email 어느 쪽에도 매칭 안 되는 입력(이름) → null 반환 (matchByName 호출 없음)", async () => {
    const client = mockClient({});
    expect(await resolveMemberByIdOrEmail(client, "홍길동")).toBeNull();
  });
});

describe("buildOrganizationMemberNameMap", () => {
  const A = "1111222233334444555";
  const B = "2222333344445555666";

  it("중복 id 는 한 번만 조회한다", async () => {
    const getMemberDetail = vi.fn(async (id: string) => ({ result: { id, name: `이름-${id}` } }));
    const client = mockClient({ getMemberDetail });

    const map = await buildOrganizationMemberNameMap(client, [A, B, A, B, A]);

    expect(getMemberDetail).toHaveBeenCalledTimes(2);
    expect(map.get(A)).toBe(`이름-${A}`);
    expect(map.get(B)).toBe(`이름-${B}`);
  });

  it("조회를 병렬로 낸다", async () => {
    let inFlight = 0;
    let peak = 0;
    const getMemberDetail = vi.fn(async (id: string) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      return { result: { id, name: `이름-${id}` } };
    });
    const client = mockClient({ getMemberDetail });

    await buildOrganizationMemberNameMap(client, [A, B]);

    expect(peak).toBe(2);
  });

  it("일부 조회가 실패해도 나머지를 채우고 실패한 id 는 map 에 넣지 않는다", async () => {
    const getMemberDetail = vi.fn(async (id: string) => {
      if (id === A) throw new Error("404");
      return { result: { id, name: `이름-${id}` } };
    });
    const client = mockClient({ getMemberDetail });

    const map = await buildOrganizationMemberNameMap(client, [A, B]);

    expect(map.has(A)).toBe(false);
    expect(map.get(B)).toBe(`이름-${B}`);
  });

  it("이름이 빈 값이면 map 에 넣지 않는다", async () => {
    const client = mockClient({
      getMemberDetail: vi.fn(async (id: string) => ({ result: { id, name: "" } })),
    });
    expect((await buildOrganizationMemberNameMap(client, [A])).has(A)).toBe(false);
  });

  it("빈 목록이면 조회하지 않는다", async () => {
    const getMemberDetail = vi.fn();
    const client = mockClient({ getMemberDetail });
    expect((await buildOrganizationMemberNameMap(client, [])).size).toBe(0);
    expect(getMemberDetail).not.toHaveBeenCalled();
  });
});

const ID_A = "1111222233334444555";
const ID_B = "2222333344445555666";

function searchClient(searchMembers: (p: any) => Promise<any>): DoorayApiClient {
  return {
    getMemberDetail: vi.fn().mockResolvedValue({ result: { id: ID_A, name: "홍길동" } }),
    searchMembers: vi.fn(searchMembers),
  } as unknown as DoorayApiClient;
}

const noMe = (): Promise<string> => Promise.reject(new Error("me 를 부르면 안 된다"));

describe("resolveOrganizationMember", () => {
  it("me 는 내 id 로 바꾼다", async () => {
    const client = searchClient(vi.fn());
    expect(await resolveOrganizationMember(client, "me", () => Promise.resolve(ID_B))).toBe(ID_B);
    expect(client.searchMembers).not.toHaveBeenCalled();
  });

  it("id 는 상세 조회로 확인하고 그대로 쓴다", async () => {
    const client = searchClient(vi.fn());
    expect(await resolveOrganizationMember(client, ID_A, noMe)).toBe(ID_A);
  });

  it("조직에 없는 이메일은 외부 사용자로 보내지 않고 거부한다", async () => {
    const client = searchClient(() => Promise.resolve({ result: [], totalCount: 0 }));
    await expect(
      resolveOrganizationMember(client, "user@example.com", noMe),
    ).rejects.toMatchObject({ exitCode: EXIT_PARAM_ERROR });
  });

  it("이름은 정확일치만 인정한다", async () => {
    const client = searchClient(() =>
      Promise.resolve({
        result: [
          { id: ID_A, name: "홍길동" },
          { id: ID_B, name: "홍길동2" },
        ],
        totalCount: 2,
      }),
    );
    expect(await resolveOrganizationMember(client, "홍길동", noMe)).toBe(ID_A);
    expect(client.searchMembers).toHaveBeenCalledWith(
      expect.objectContaining({ name: "홍길동", page: 0 }),
    );
  });

  it("부분일치만 있으면 거부한다", async () => {
    const client = searchClient(() =>
      Promise.resolve({ result: [{ id: ID_B, name: "홍길동2" }], totalCount: 1 }),
    );
    await expect(resolveOrganizationMember(client, "홍길동", noMe)).rejects.toMatchObject({
      exitCode: EXIT_PARAM_ERROR,
      message: expect.stringContaining("찾을 수 없습니다"),
    });
  });

  it("이메일로 찾지 못한 오류에 되돌려 보여주는 입력의 제어 문자를 지운다", async () => {
    const client = searchClient(() => Promise.resolve({ result: [], totalCount: 0 }));
    const error = await resolveOrganizationMember(client, "\u001b[31muser@example.com", noMe).catch((e) => e);
    expect(error.message).toContain("?[31muser@example.com");
    expect(error.message).not.toContain("\u001b");
  });

  it("오류에 되돌려 보여주는 이름의 제어 문자를 지운다", async () => {
    const name = "\u001b[31m홍길동";
    const client = searchClient(() =>
      Promise.resolve({ result: [{ id: ID_A, name }, { id: ID_B, name }], totalCount: 2 }),
    );
    const error = await resolveOrganizationMember(client, name, noMe).catch((e) => e);
    expect(error.message).toContain(`?[31m홍길동 (${ID_A})`);
    expect(error.message).not.toContain("\u001b");
  });

  it("동명이인이면 이름과 id 를 나열하고 거부한다", async () => {
    const client = searchClient(() =>
      Promise.resolve({
        result: [
          { id: ID_A, name: "홍길동" },
          { id: ID_B, name: "홍길동" },
        ],
        totalCount: 2,
      }),
    );
    await expect(resolveOrganizationMember(client, "홍길동", noMe)).rejects.toMatchObject({
      exitCode: EXIT_PARAM_ERROR,
      message: expect.stringMatching(new RegExp(`여럿.*${ID_A}.*${ID_B}`, "s")),
    });
  });

  it("검색 결과가 여러 쪽이면 다음 쪽도 본다", async () => {
    const search = vi
      .fn()
      .mockResolvedValueOnce({
        result: Array.from({ length: 100 }, (_, i) => ({ id: String(i), name: `홍길동${i}` })),
        totalCount: 101,
      })
      .mockResolvedValueOnce({ result: [{ id: ID_B, name: "홍길동" }], totalCount: 101 });
    const client = searchClient(search);
    expect(await resolveOrganizationMember(client, "홍길동", noMe)).toBe(ID_B);
    expect(search).toHaveBeenCalledTimes(2);
  });

  it("totalCount 가 없어도 첫 쪽이 꽉 찼으면 다음 쪽의 동명이인을 본다", async () => {
    const search = vi
      .fn()
      .mockResolvedValueOnce({
        result: [
          { id: ID_A, name: "홍길동" },
          ...Array.from({ length: 99 }, (_, i) => ({ id: String(i), name: `홍길동${i}` })),
        ],
      })
      .mockResolvedValueOnce({ result: [{ id: ID_B, name: "홍길동" }] });
    await expect(resolveOrganizationMember(searchClient(search), "홍길동", noMe)).rejects.toMatchObject({
      exitCode: EXIT_PARAM_ERROR,
      message: expect.stringMatching(new RegExp(`여럿.*${ID_A}.*${ID_B}`, "s")),
    });
    expect(search).toHaveBeenCalledTimes(2);
  });

  it("totalCount 가 없고 마지막 쪽이 꽉 찼으면 빈 다음 쪽에서 끝낸다", async () => {
    const search = vi
      .fn()
      .mockResolvedValueOnce({
        result: [
          { id: ID_A, name: "홍길동" },
          ...Array.from({ length: 99 }, (_, i) => ({ id: String(i), name: `홍길동${i}` })),
        ],
      })
      .mockResolvedValueOnce({ result: [] });
    expect(await resolveOrganizationMember(searchClient(search), "홍길동", noMe)).toBe(ID_A);
    expect(search).toHaveBeenCalledTimes(2);
  });

  it("totalCount 가 없고 쪽이 덜 찼으면 그 쪽에서 끝낸다", async () => {
    const search = vi.fn().mockResolvedValue({ result: [{ id: ID_A, name: "홍길동" }] });
    expect(await resolveOrganizationMember(searchClient(search), "홍길동", noMe)).toBe(ID_A);
    expect(search).toHaveBeenCalledTimes(1);
  });

  describe("쪽 상한(5쪽)에 닿았을 때", () => {
    const filler = (page: number) =>
      Array.from({ length: 100 }, (_, i) => ({ id: `${page}-${i}`, name: `홍길동${i}` }));

    function pagedSearch(exactOnPages: Record<number, string[]>) {
      return vi.fn(({ page }: { page: number }) =>
        Promise.resolve({
          result: [
            ...filler(page).slice((exactOnPages[page] ?? []).length),
            ...(exactOnPages[page] ?? []).map((id) => ({ id, name: "홍길동" })),
          ],
          totalCount: 10000,
        }),
      );
    }

    // 보지 못한 쪽에 같은 이름이 더 있을 수 있어, 찾은 사람이 있어도 고르지 않는다.
    it("정확일치가 한 명이어도 고르지 않고 후보를 보여주며 오류로 끝낸다", async () => {
      const search = pagedSearch({ 2: [ID_A] });
      await expect(resolveOrganizationMember(searchClient(search), "홍길동", noMe)).rejects.toMatchObject({
        exitCode: EXIT_PARAM_ERROR,
        message: expect.stringMatching(new RegExp(`너무 많아.*찾은 정확일치.*홍길동 \\(${ID_A}\\)`, "s")),
      });
      expect(search).toHaveBeenCalledTimes(5);
    });

    it("정확일치가 둘 이상이어도 같은 오류에 후보를 모두 보여준다", async () => {
      const search = pagedSearch({ 0: [ID_A], 4: [ID_B] });
      await expect(resolveOrganizationMember(searchClient(search), "홍길동", noMe)).rejects.toMatchObject({
        exitCode: EXIT_PARAM_ERROR,
        message: expect.stringMatching(new RegExp(`너무 많아.*${ID_A}.*${ID_B}`, "s")),
      });
    });

    it("정확일치가 없으면 후보 없이 결과가 너무 많다고 알린다", async () => {
      const search = pagedSearch({});
      const error = await resolveOrganizationMember(searchClient(search), "홍길동", noMe).catch((e) => e);
      expect(error).toMatchObject({ exitCode: EXIT_PARAM_ERROR });
      expect(error.message).toContain("너무 많아");
      expect(error.message).not.toContain("찾은 정확일치");
      expect(search).toHaveBeenCalledTimes(5);
    });
  });
});
