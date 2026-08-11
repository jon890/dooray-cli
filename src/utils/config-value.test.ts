import { describe, expect, it, vi } from "vitest";
import { resolveConfigValue } from "./config-value.js";
import { DoorayCliError } from "./errors.js";
import { EXIT_PARAM_ERROR } from "./exit-codes.js";

describe("resolveConfigValue", () => {
  it("일반 값은 그대로 반환하고 stdin 을 읽지 않는다", async () => {
    const read = vi.fn();

    await expect(resolveConfigValue("abc123", read)).resolves.toBe("abc123");
    expect(read).not.toHaveBeenCalled();
  });

  it("`-` 이면 stdin 에서 읽는다", async () => {
    const read = vi.fn().mockResolvedValue("token-from-stdin");

    await expect(resolveConfigValue("-", read)).resolves.toBe(
      "token-from-stdin",
    );
    expect(read).toHaveBeenCalledOnce();
  });

  it("stdin 값의 양끝 공백과 줄바꿈을 제거한다", async () => {
    const read = vi.fn().mockResolvedValue("  token-with-newline\n");

    await expect(resolveConfigValue("-", read)).resolves.toBe(
      "token-with-newline",
    );
  });

  it("stdin 값이 비면 EXIT_PARAM_ERROR 로 거부한다", async () => {
    const read = vi.fn().mockResolvedValue("\n  \n");

    await expect(resolveConfigValue("-", read)).rejects.toMatchObject({
      exitCode: EXIT_PARAM_ERROR,
    });
    await expect(resolveConfigValue("-", read)).rejects.toBeInstanceOf(
      DoorayCliError,
    );
  });

  it("값 안의 `-` 는 stdin 으로 해석하지 않는다", async () => {
    const read = vi.fn();

    await expect(resolveConfigValue("a-b", read)).resolves.toBe("a-b");
    expect(read).not.toHaveBeenCalled();
  });
});
