import { Command } from "commander";
import { wikiPageFileListCommand } from "./list.js";
import { wikiPageFileUploadCommand } from "./upload.js";
import { wikiPageFileDownloadCommand } from "./download.js";
import { wikiPageFileDownloadAllCommand } from "./download-all.js";
import { wikiPageFileDeleteCommand } from "./delete.js";

export const wikiPageFileCommand = new Command("file")
  .description("위키 페이지 첨부파일 관련 명령");

wikiPageFileCommand.addCommand(wikiPageFileListCommand);
wikiPageFileCommand.addCommand(wikiPageFileUploadCommand);
wikiPageFileCommand.addCommand(wikiPageFileDownloadCommand);
wikiPageFileCommand.addCommand(wikiPageFileDownloadAllCommand);
wikiPageFileCommand.addCommand(wikiPageFileDeleteCommand);
