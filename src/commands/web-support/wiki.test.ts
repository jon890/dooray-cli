import { Command } from "commander";
import { describe, expect, it } from "vitest";
import { assertWebSupported } from "../web-support.js";
import { wikiPageEditCommand } from "../wiki/page-edit.js";
import { wikiPageMoveCommand } from "../wiki/page-move.js";
import { wikiWebSupport } from "./wiki.js";

describe("위키 웹 지원 목록", () => {
  it("--mime-type 은 값과 관계없이 요청 전에 막는다", () => {
    for (const value of ["text/x-markdown", "text/html"]) {
      expect(() => assertWebSupported("wiki page edit", { mimeType: value }, "web")).toThrow(expect.objectContaining({ exitCode: 3 }));
    }
    expect(() => assertWebSupported("wiki page edit", { title: "제목" }, "web")).not.toThrow();
  });

  it("--to-wiki 는 요청 전에 막는다", () => {
    expect(() => assertWebSupported("wiki page move", { toWiki: "project" }, "web")).toThrow(expect.objectContaining({ exitCode: 3 }));
    expect(() => assertWebSupported("wiki page move", { parent: "page" }, "web")).not.toThrow();
  });

  it("목록에 없는 wiki 하위 명령은 막고 API 방식은 통과한다", () => {
    expect(() => assertWebSupported("wiki page referrers", {}, "web")).toThrow(expect.objectContaining({ exitCode: 3 }));
    expect(() => assertWebSupported("wiki page referrers", {}, "api-key")).not.toThrow();
  });

  it("목록의 옵션 이름은 실제 명령의 옵션 속성 이름과 같다", () => {
    const commands: Record<string, Command> = { "wiki page edit": wikiPageEditCommand, "wiki page move": wikiPageMoveCommand };
    for (const [path, command] of Object.entries(commands)) {
      const attributes = command.options.map((option) => option.attributeName());
      for (const name of wikiWebSupport[path]) expect(attributes).toContain(name);
    }
  });

  it("지원하는 명령은 모두 wiki 로 시작한다", () => {
    expect(Object.keys(wikiWebSupport).every((path) => path.startsWith("wiki "))).toBe(true);
  });
});
