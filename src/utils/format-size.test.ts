import { describe, expect, it } from "vitest";
import { formatSize } from "./format-size.js";

describe("formatSize", () => {
  it.each([
    [0, "0B"],
    [1023, "1023B"],
    [1024, "1.0KB"],
    [1024 * 1024, "1.0MB"],
    [null, "-"],
    [undefined, "-"],
  ])("%s 바이트를 %s로 표기", (bytes, expected) => {
    expect(formatSize(bytes)).toBe(expected);
  });
});
