import type { Command } from "commander";
import { describe, expect, it } from "vitest";
import {
  WIKI_PAGE_ID_OPTION_DESC,
  WIKI_PAGE_PROJECT_OPTION_DESC,
} from "../../resolvers/wiki-page-input.js";
import { wikiPageGetCommand } from "./page-get.js";
import { wikiPageDeleteCommand } from "./page-delete.js";
import { wikiPageMoveCommand } from "./page-move.js";
import { wikiPageReplaceCommand } from "./page-replace.js";
import { wikiPageFileDownloadAllCommand } from "./page-file/download-all.js";
import { wikiPageFileDownloadCommand } from "./page-file/download.js";
import { wikiPageFileListCommand } from "./page-file/list.js";
import { wikiPageFileUploadCommand } from "./page-file/upload.js";
import { wikiPageFileDeleteCommand } from "./page-file/delete.js";
import { wikiPageCommentGetCommand } from "./page-comment/get.js";
import { wikiPageCommentEditCommand } from "./page-comment/edit.js";
import { wikiPageCommentLatestCommand } from "./page-comment/latest.js";
import { wikiPageCommentAddCommand } from "./page-comment/add.js";
import { wikiPageCommentListCommand } from "./page-comment/list.js";
import { wikiPageCommentDeleteCommand } from "./page-comment/delete.js";

const commands: { name: string; command: Command }[] = [
  { name: "wiki page get", command: wikiPageGetCommand },
  { name: "wiki page delete", command: wikiPageDeleteCommand },
  { name: "wiki page move", command: wikiPageMoveCommand },
  { name: "wiki page replace", command: wikiPageReplaceCommand },
  { name: "wiki page file download-all", command: wikiPageFileDownloadAllCommand },
  { name: "wiki page file download", command: wikiPageFileDownloadCommand },
  { name: "wiki page file list", command: wikiPageFileListCommand },
  { name: "wiki page file upload", command: wikiPageFileUploadCommand },
  { name: "wiki page file delete", command: wikiPageFileDeleteCommand },
  { name: "wiki page comment get", command: wikiPageCommentGetCommand },
  { name: "wiki page comment edit", command: wikiPageCommentEditCommand },
  { name: "wiki page comment latest", command: wikiPageCommentLatestCommand },
  { name: "wiki page comment add", command: wikiPageCommentAddCommand },
  { name: "wiki page comment list", command: wikiPageCommentListCommand },
  { name: "wiki page comment delete", command: wikiPageCommentDeleteCommand },
];

function findOption(command: Command, long: string) {
  return command.options.find((option) => option.long === long);
}

describe.each(commands)("$name", ({ command }) => {
  it("--id 설명이 공용 상수와 같다", () => {
    const option = findOption(command, "--id");
    expect(option?.description).toBe(WIKI_PAGE_ID_OPTION_DESC);
  });

  it("--project 설명이 공용 상수와 같다", () => {
    const option = findOption(command, "--project");
    expect(option?.description).toBe(WIKI_PAGE_PROJECT_OPTION_DESC);
  });

  it("--id 설명에 어긋난 표현(동반)이 없다", () => {
    const option = findOption(command, "--id");
    expect(option?.description).not.toContain("동반");
  });
});
