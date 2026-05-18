import { describe, it, expect } from "vitest";
import { matchByName } from "./match.js";
import { DoorayCliError } from "../utils/errors.js";

interface TestItem {
  name: string;
  id: string;
}
const render = (i: TestItem) => `${i.name} (${i.id})`;

describe("matchByName", () => {
  it("정확일치 1건 반환", () => {
    const items: TestItem[] = [
      { name: "foo", id: "1" },
      { name: "bar", id: "2" },
    ];
    expect(matchByName(items, "foo", "그룹", render).id).toBe("1");
  });

  it("name 이 undefined 인 항목은 매칭에서 제외 (가드)", () => {
    // @ts-expect-error — 의도적 undefined 주입 (실제 API 응답 시뮬레이션)
    const items: TestItem[] = [{ name: undefined, id: "1" }, { name: "foo", id: "2" }];
    expect(matchByName(items, "foo", "그룹", render).id).toBe("2");
  });

  it("not-found 시 후보 5개 + 전체 수 + helpHint 출력", () => {
    const items: TestItem[] = Array.from({ length: 7 }, (_, i) => ({
      name: `g${i}`,
      id: `${i}`,
    }));
    try {
      matchByName(items, "missing", "그룹", render, {
        helpHint: "dooray project groups <project>",
      });
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(DoorayCliError);
      const msg = (e as DoorayCliError).message;
      expect(msg).toContain("그룹을(를) 찾을 수 없습니다: missing");
      expect(msg).toContain("사용 가능한 그룹 (5/7):");
      expect(msg).toContain("전체 목록: dooray project groups <project>");
    }
  });

  it("items 빈 배열은 후보/hint 없이 기본 not-found", () => {
    try {
      matchByName([], "x", "그룹", render, { helpHint: "..." });
    } catch (e) {
      const msg = (e as DoorayCliError).message;
      expect(msg).toBe("그룹을(를) 찾을 수 없습니다: x");
    }
  });
});
