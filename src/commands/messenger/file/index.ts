import { Command } from "commander";
import { messengerFileDownloadCommand } from "./download.js";

export const messengerFileCommand = new Command("file")
  .description("메신저 대화방 첨부 파일")
  .addCommand(messengerFileDownloadCommand);
