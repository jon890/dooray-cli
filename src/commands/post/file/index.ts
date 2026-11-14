import { Command } from "commander";
import { fileListCommand } from "./list.js";
import { fileDownloadCommand } from "./download.js";
import { fileDownloadAllCommand } from "./download-all.js";
import { fileUploadCommand } from "./upload.js";
import { fileDeleteCommand } from "./delete.js";

export const postFileCommand = new Command("file").description("첨부파일 관련 명령");

postFileCommand.addCommand(fileListCommand);
postFileCommand.addCommand(fileDownloadCommand);
postFileCommand.addCommand(fileDownloadAllCommand);
postFileCommand.addCommand(fileUploadCommand);
postFileCommand.addCommand(fileDeleteCommand);
