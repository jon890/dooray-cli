import { describe, expect, it, vi } from "vitest";
import { authorizeMailLogout } from "./logout.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";

describe("authorizeMailLogout", () => {
  it("non-TTY 환경에서 --yes가 없으면 제거를 차단한다", async () => {
    const confirmRemoval = vi.fn();

    await expect(
      authorizeMailLogout(false, false, confirmRemoval),
    ).rejects.toMatchObject({ exitCode: EXIT_PARAM_ERROR });
    expect(confirmRemoval).not.toHaveBeenCalled();
  });

  it("--yes가 있으면 TTY 여부와 관계없이 제거를 허용한다", async () => {
    const confirmRemoval = vi.fn();

    await expect(authorizeMailLogout(true, false, confirmRemoval)).resolves.toBe(
      true,
    );
    expect(confirmRemoval).not.toHaveBeenCalled();
  });

  it("대화형 확인을 거절하면 제거하지 않는다", async () => {
    const confirmRemoval = vi.fn().mockResolvedValue(false);

    await expect(
      authorizeMailLogout(false, true, confirmRemoval),
    ).resolves.toBe(false);
    expect(confirmRemoval).toHaveBeenCalledOnce();
  });
});
