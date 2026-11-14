/**
 * 경로 별칭 `@/…` 이 vitest 와 vi.mock 에서 상대 경로와 같은 모듈로 풀리는지 본다 (ADR-082).
 * vi.mock 은 별칭으로 mock 하고 상대 경로로 가져오는 방향과 그 반대 방향을 둘 다 본다.
 * 빌드와 타입 검사가 별칭을 푸는지는 src/index.ts 의 `@/version.js` import 가 보인다.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/utils/format-size.js", () => ({ formatSize: () => "별칭으로 바꾼 값" }));
vi.mock("./utils/local-date.js", () => ({ formatLocalDate: () => "상대 경로로 바꾼 값" }));

describe("경로 별칭 @/", () => {
  it("별칭과 상대 경로가 같은 모듈을 가리킨다", async () => {
    const viaAlias = await import("@/utils/exit-codes.js");
    const viaRelative = await import("./utils/exit-codes.js");
    expect(viaAlias).toBe(viaRelative);
  });

  it("vi.mock 에 준 별칭이 상대 경로 import 에도 적용된다", async () => {
    const { formatSize } = await import("./utils/format-size.js");
    expect(formatSize(1024)).toBe("별칭으로 바꾼 값");
  });

  it("vi.mock 에 준 상대 경로가 별칭 import 에도 적용된다", async () => {
    const localDate = await import("@/utils/local-date.js");
    expect(Object.keys(localDate)).toEqual(["formatLocalDate"]);
  });
});
