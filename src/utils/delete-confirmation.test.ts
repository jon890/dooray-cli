import { afterEach, describe, expect, it, vi } from "vitest";
import { EXIT_PARAM_ERROR } from "./exit-codes.js";
import {
  authorizeDeletion,
  promptDeletion,
} from "./delete-confirmation.js";

const { confirmMock } = vi.hoisted(() => ({
  confirmMock: vi.fn(),
}));

vi.mock("@inquirer/prompts", () => ({
  confirm: confirmMock,
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe("authorizeDeletion", () => {
  it.each([true, false])(
    "--yes면 isTTY=%s에서도 확인 없이 허용한다",
    async (isTTY) => {
      const confirmDeletion = vi.fn();

      await expect(
        authorizeDeletion(true, isTTY, confirmDeletion),
      ).resolves.toBe(true);
      expect(confirmDeletion).not.toHaveBeenCalled();
    },
  );

  it("non-TTY에서 --yes가 없으면 종료 코드 3으로 차단한다", async () => {
    const confirmDeletion = vi.fn();

    await expect(
      authorizeDeletion(false, false, confirmDeletion),
    ).rejects.toMatchObject({
      exitCode: EXIT_PARAM_ERROR,
      message: expect.stringContaining("--yes(-y)"),
    });
    expect(confirmDeletion).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    "TTY에서는 확인 결과 %s를 보존한다",
    async (answer) => {
      const confirmDeletion = vi.fn().mockResolvedValue(answer);

      await expect(
        authorizeDeletion(false, true, confirmDeletion),
      ).resolves.toBe(answer);
      expect(confirmDeletion).toHaveBeenCalledOnce();
    },
  );
});

describe("promptDeletion", () => {
  it("기본값이 아니오인 확인 프롬프트를 연다", async () => {
    confirmMock.mockResolvedValueOnce(false);

    await expect(promptDeletion("삭제할까요?")).resolves.toBe(false);
    expect(confirmMock).toHaveBeenCalledWith({
      message: "삭제할까요?",
      default: false,
    });
  });
});
