import { describe, expect, it } from "vitest";
import { preserveConfirmed } from "./classified.mjs";

const fresh = (id, label) => ({ id, label, signals: {}, confirmed: false });

describe("preserveConfirmed", () => {
  it("다시 분류해도 확정된 항목의 라벨과 confirmed 를 유지한다", () => {
    const { entries, preserved } = preserveConfirmed(
      [fresh("a", "human"), fresh("b", "human")],
      [
        { id: "a", label: "ai-confirmed", confirmed: true },
        { id: "b", label: "ai-suspect", confirmed: false },
      ],
    );
    expect(preserved).toBe(1);
    expect(entries[0]).toMatchObject({ id: "a", label: "ai-confirmed", confirmed: true });
    expect(entries[1]).toMatchObject({ id: "b", label: "human", confirmed: false });
  });

  it("이전 파일에 없는 항목과 이전 파일이 비어 있는 경우는 그대로 둔다", () => {
    const input = [fresh("a", "human")];
    expect(preserveConfirmed(input, [])).toEqual({ entries: input, preserved: 0 });
  });
});
