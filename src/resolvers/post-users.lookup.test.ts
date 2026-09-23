import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DoorayApiClient } from "../api/client.js";
import { DoorayCliError } from "../utils/errors.js";
import {
  EXIT_API_ERROR,
  EXIT_AUTH_ERROR,
  EXIT_PARAM_ERROR,
} from "../utils/exit-codes.js";

const mocks = vi.hoisted(() => ({
  resolveMember: vi.fn(),
  resolveMemberGroup: vi.fn(),
}));

vi.mock("./member.js", () => ({ resolveMember: mocks.resolveMember }));
vi.mock("./member-group.js", () => ({
  resolveMemberGroup: mocks.resolveMemberGroup,
}));

const { resolveUserAdditions } = await import("./post-users.js");
const client = {} as DoorayApiClient;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveUserAdditions 오류 종료 코드", () => {
  it("멤버 조회의 DoorayCliError 는 접두사를 붙이고 종료 코드를 이어받는다", async () => {
    const original = new DoorayCliError("API 호출 실패: 권한 없음", EXIT_AUTH_ERROR);
    mocks.resolveMember.mockRejectedValue(original);

    const err = await resolveUserAdditions(client, "project-1", ["홍길동"], []).catch(
      (e: unknown) => e,
    );

    expect(err).toBeInstanceOf(DoorayCliError);
    expect(err).toMatchObject({
      exitCode: EXIT_AUTH_ERROR,
      message: "멤버 '홍길동' 조회 실패: API 호출 실패: 권한 없음",
      cause: original,
    });
  });

  it("그룹 조회의 입력 오류도 종료 코드 3 을 유지한다", async () => {
    const original = new DoorayCliError("그룹을 찾을 수 없습니다", EXIT_PARAM_ERROR);
    mocks.resolveMemberGroup.mockRejectedValue(original);

    await expect(
      resolveUserAdditions(client, "project-1", [], ["dev"]),
    ).rejects.toMatchObject({
      exitCode: EXIT_PARAM_ERROR,
      message: "그룹 'dev' 조회 실패: 그룹을 찾을 수 없습니다",
      cause: original,
    });
  });

  it("일반 Error 는 API 오류 종료 코드로 감싼다", async () => {
    const original = new Error("ECONNRESET");
    mocks.resolveMember.mockRejectedValue(original);

    const err = await resolveUserAdditions(client, "project-1", ["홍길동"], []).catch(
      (e: unknown) => e,
    );

    expect(err).toBeInstanceOf(DoorayCliError);
    expect(err).toMatchObject({ exitCode: EXIT_API_ERROR, cause: original });
  });
});
