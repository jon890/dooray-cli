import { describe, it, expect } from "vitest";
import { mergeTagIds } from "./post-tags.js";

describe("mergeTagIds", () => {
  it("append + dedupe (기존 [a,b] + 추가 [b,c] → [a,b,c])", () => {
    expect(mergeTagIds(["a", "b"], ["b", "c"], [], false)).toEqual(["a", "b", "c"]);
  });
  it("clear + add (기존 [a,b] clear + 추가 [c] → [c])", () => {
    expect(mergeTagIds(["a", "b"], ["c"], [], true)).toEqual(["c"]);
  });
  it("remove (기존 [a,b,c] - [b] → [a,c])", () => {
    expect(mergeTagIds(["a", "b", "c"], [], ["b"], false)).toEqual(["a", "c"]);
  });
  it("순서 clear → remove → add ([a,b] clear remove[a] add[c,d] → [c,d])", () => {
    expect(mergeTagIds(["a", "b"], ["c", "d"], ["a"], true)).toEqual(["c", "d"]);
  });
});
