import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveProject } from "./project.js";
import { getPrivateProjects, getProjects, setProjects, setPrivateProjects } from "../cache/store.js";
import type { DoorayApiClient } from "../api/client.js";
import { DoorayCliError } from "../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../utils/exit-codes.js";

// cache store mock — ensureProjects 내부에서 호출하는 함수들을 mock
// self-mock (vi.mock("./project.js")) 는 동일 파일 내부 함수 참조를 교체 못함 → 사용 금지
// vi.mock 은 호이스팅되므로 factory 안에 fixture 를 인라인으로 작성 (top-level const 참조 금지)
vi.mock("../cache/store.js", () => ({
  getProjects: vi.fn().mockResolvedValue({
    data: [
      { id: "1111222233334444555", code: "project-a", wikiId: undefined },
      { id: "2222333344445555666", code: "project-b", wikiId: undefined },
    ],
    updatedAt: new Date().toISOString(),
  }),
  setProjects: vi.fn().mockResolvedValue(undefined),
  getPrivateProjects: vi.fn().mockResolvedValue(null),
  setPrivateProjects: vi.fn().mockResolvedValue(undefined),
  isExpired: vi.fn().mockReturnValue(false),
}));

/**
 * 공용 캐시에서 못 찾으면 resolveProject 가 private 목록을 받으러 간다 (ADR-054).
 * 그래서 빈 client 로는 TypeError 가 나므로 getProjects 를 가진 mock 을 넘긴다.
 */
function mockClient(privateProjects: { id: string; code: string }[] = []): DoorayApiClient {
  return {
    getProjects: vi.fn().mockResolvedValue({
      result: privateProjects.map((p) => ({ ...p, wiki: undefined })),
      totalCount: privateProjects.length,
    }),
  } as unknown as DoorayApiClient;
}

describe("resolveProject", () => {
  beforeEach(() => vi.clearAllMocks());

  it("code 매칭 — 기존 흐름", async () => {
    const result = await resolveProject({} as unknown as DoorayApiClient, "project-a");
    expect(result).toBe("1111222233334444555");
  });

  it("다른 인증의 프로젝트를 조회할 때 공유 캐시를 읽거나 채우지 않는다", async () => {
    const client = mockClient([{ id: "project-web", code: "project-a" }]);
    expect(await resolveProject(client, "project-a", { useCache: false })).toBe("project-web");
    expect(getProjects).not.toHaveBeenCalled();
    expect(getPrivateProjects).not.toHaveBeenCalled();
    expect(setProjects).not.toHaveBeenCalled();
    expect(setPrivateProjects).not.toHaveBeenCalled();
  });

  it("numeric 15자리 이상 — cache 우회", async () => {
    const result = await resolveProject({} as unknown as DoorayApiClient, "9999888877776666555");
    expect(result).toBe("9999888877776666555");
  });

  it("numeric 15+자리 — cache 에 있어도 그대로 반환 (성능 우선)", async () => {
    const result = await resolveProject({} as unknown as DoorayApiClient, "1111222233334444555");
    expect(result).toBe("1111222233334444555");
  });

  it("code 매칭 실패 — 내부 번호와 API 용어 없이 회피책을 안내한다", async () => {
    await expect(resolveProject(mockClient(), "nonexistent-code")).rejects.toSatisfy(
      (err: unknown) => {
        expect(err).toBeInstanceOf(DoorayCliError);
        if (!(err instanceof DoorayCliError)) return false;
        expect(err.exitCode).toBe(EXIT_PARAM_ERROR);
        expect(err.message).toContain("프로젝트를 찾을 수 없습니다: nonexistent-code");
        expect(err.message).not.toContain("ADR");
        expect(err.message).not.toContain("member=me");
        // CLI 가 private 목록을 스스로 받으므로 사람에게 캐시 갱신을 시키지 않는다 (ADR-054)
        expect(err.message).not.toContain("dooray project list --type private");
        expect(err.message).toContain("15자리 이상 숫자");
        return true;
      },
    );
  });

  it("private 캐시가 비어 있으면 그 목록을 받아 코드를 찾는다", async () => {
    const client = mockClient([{ id: "3333444455556666777", code: "@my-account" }]);

    const result = await resolveProject(client, "@my-account");

    expect(result).toBe("3333444455556666777");
    expect(client.getProjects).toHaveBeenCalledWith(
      expect.objectContaining({ type: "private" }),
    );
  });

  it("private 캐시가 유효하면 목록을 받지 않는다", async () => {
    vi.mocked(getPrivateProjects).mockResolvedValueOnce({
      data: [{ id: "3333444455556666777", code: "@my-account" }],
      updatedAt: new Date().toISOString(),
    });
    const client = mockClient();

    const result = await resolveProject(client, "@my-account");

    expect(result).toBe("3333444455556666777");
    expect(client.getProjects).not.toHaveBeenCalled();
  });
});
