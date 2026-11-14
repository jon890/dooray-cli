import { describe, expect, it } from "vitest";
import type { Command } from "commander";
import { projectCommand } from "@/commands/project/index.js";
import { postCommand } from "@/commands/post/index.js";
import { wikiCommand } from "@/commands/wiki/index.js";
import { mailCommand } from "@/commands/mail/index.js";

/** Commander 의 `--help` 는 등록한 순서로 하위 명령을 보이므로 순서까지 같아야 한다. */
function names(command: Command): string[] {
  return command.commands.map((c) => c.name());
}

describe("영역별 명령 나무", () => {
  it("project", () => {
    expect(projectCommand.name()).toBe("project");
    expect(names(projectCommand)).toEqual(["list", "members", "workflows", "groups", "tags", "templates"]);
    const tags = projectCommand.commands.find((c) => c.name() === "tags")!;
    expect(names(tags)).toEqual(["list", "create", "group"]);
  });

  it("post", () => {
    expect(postCommand.name()).toBe("post");
    expect(names(postCommand)).toEqual([
      "list", "search", "get", "edit", "replace", "create", "done", "workflow", "comment", "file",
    ]);
    const comment = postCommand.commands.find((c) => c.name() === "comment")!;
    expect(names(comment)).toEqual(["list", "latest", "get", "add", "edit", "delete", "file"]);
    const file = postCommand.commands.find((c) => c.name() === "file")!;
    expect(names(file)).toEqual(["list", "download", "download-all", "upload", "delete"]);
  });

  it("wiki", () => {
    expect(wikiCommand.name()).toBe("wiki");
    expect(names(wikiCommand)).toEqual(["list", "pages", "tree", "page"]);
    const page = wikiCommand.commands.find((c) => c.name() === "page")!;
    expect(names(page)).toEqual(["get", "create", "edit", "replace", "delete", "move", "file", "comment"]);
  });

  it("mail", () => {
    expect(mailCommand.name()).toBe("mail");
    expect(names(mailCommand)).toEqual(["list", "get", "attachment", "send", "reply", "logout"]);
  });
});
