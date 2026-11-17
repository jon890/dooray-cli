import { describe, expect, it } from "vitest";
import { formatSentAt } from "./datetime.js";

describe("formatSentAt", () => {
  it("+09:00 이면 분 단위로 자른다", () => {
    expect(formatSentAt("2026-09-18T11:38:11+09:00")).toBe("2026-09-18 11:38");
    expect(formatSentAt("2026-09-18T11:38:11.123+09:00")).toBe("2026-09-18 11:38");
  });

  it("콜론 없는 +0900 도 분 단위로 자른다", () => {
    expect(formatSentAt("2026-11-14T11:26:36+0900")).toBe("2026-11-14 11:26");
  });

  it("콜론 없는 다른 offset 은 원형을 그대로 둔다", () => {
    expect(formatSentAt("2026-11-14T11:26:36+0000")).toBe("2026-11-14T11:26:36+0000");
    expect(formatSentAt("2026-11-14T11:26:36-0500")).toBe("2026-11-14T11:26:36-0500");
  });

  it("+09:00 이 아닌 offset 이나 Z 는 원형을 그대로 둔다", () => {
    expect(formatSentAt("2026-09-18T11:38:11Z")).toBe("2026-09-18T11:38:11Z");
    expect(formatSentAt("2026-09-18T11:38:11+00:00")).toBe("2026-09-18T11:38:11+00:00");
    expect(formatSentAt("2026-09-18T11:38:11-05:00")).toBe("2026-09-18T11:38:11-05:00");
  });

  it("비-ISO 와 undefined 를 견딘다", () => {
    expect(formatSentAt("이상한값")).toBe("이상한값");
    expect(formatSentAt(undefined)).toBe("");
  });
});
