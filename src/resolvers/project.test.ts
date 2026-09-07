import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveProject } from "./project.js";
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
    updatedAt: Date.now(),
  }),
  setProjects: vi.fn().mockResolvedValue(undefined),
  getPrivateProjects: vi.fn().mockResolvedValue(null),
  setPrivateProjects: vi.fn().mockResolvedValue(undefined),
  isExpired: vi.fn().mockReturnValue(false),
}));

describe("resolveProject", () => {
  beforeEach(() => vi.clearAllMocks());

  it("code 매칭 — 기존 흐름", async () => {
    const result = await resolveProject({} as unknown as DoorayApiClient, "project-a");
    expect(result).toBe("1111222233334444555");
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
    await expect(resolveProject({} as unknown as DoorayApiClient, "nonexistent-code")).rejects.toSatisfy(
      (err: unknown) => {
        expect(err).toBeInstanceOf(DoorayCliError);
        if (!(err instanceof DoorayCliError)) return false;
        expect(err.exitCode).toBe(EXIT_PARAM_ERROR);
        expect(err.message).toContain("프로젝트를 찾을 수 없습니다: nonexistent-code");
        expect(err.message).not.toContain("ADR");
        expect(err.message).not.toContain("member=me");
        expect(err.message).toContain("dooray project list --type private");
        expect(err.message).toContain("15자리 이상 숫자");
        return true;
      },
    );
  });
});
