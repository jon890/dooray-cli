import { describe, expect, it } from "vitest";
import { extractCommentIds } from "./session-ids.mjs";

describe("extractCommentIds", () => {
  it("기본 출력의 댓글 id 를 읽는다", () => {
    const line = JSON.stringify({ text: "댓글이 추가되었습니다: abc123_-X\n" });
    expect([...extractCommentIds(line)]).toEqual(["abc123_-X"]);
  });

  it("세션 로그에 이스케이프된 --json 출력의 댓글 id 를 읽는다", () => {
    const output = JSON.stringify({ id: "c-json-1" }, null, 2) + "\n";
    // 도구 결과는 jsonl 한 줄의 문자열 안에 들어가므로 따옴표와 줄바꿈이 이스케이프된다.
    const line = JSON.stringify({ type: "tool_result", content: output });
    expect(line).toContain('\\"id\\"');
    expect([...extractCommentIds(line)]).toEqual(["c-json-1"]);
  });

  it("이스케이프되지 않은 --json 출력도 읽는다", () => {
    expect([...extractCommentIds('{ "id": "plain-2" }')]).toEqual(["plain-2"]);
  });

  it("한 줄의 여러 id 와 기존 집합을 모은다", () => {
    const ids = new Set(["old"]);
    extractCommentIds('{"id":"a"} 그리고 댓글이 추가되었습니다: b', ids);
    expect([...ids].sort()).toEqual(["a", "b", "old"]);
  });

  it("id 외에 다른 키가 있는 객체나 관련 없는 줄은 읽지 않는다", () => {
    expect(extractCommentIds('{"id":"x","name":"y"}').size).toBe(0);
    expect(extractCommentIds("아무 내용 없음").size).toBe(0);
  });
});
