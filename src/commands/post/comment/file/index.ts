import { Command } from "commander";
import { listCommentFileCommand } from "./list.js";
import { uploadCommentFileCommand } from "./upload.js";
import { downloadCommentFileCommand } from "./download.js";
import { deleteCommentFileCommand } from "./delete.js";

export const commentFileCommand = new Command("file")
  .description("댓글 첨부 파일 관리 (post-level files API + 댓글 PUT 합성, ADR-024)")
  .addCommand(listCommentFileCommand)
  .addCommand(uploadCommentFileCommand)
  .addCommand(downloadCommentFileCommand)
  .addCommand(deleteCommentFileCommand);
