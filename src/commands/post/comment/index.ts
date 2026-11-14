import { Command } from "commander";
import { commentListCommand } from "./list.js";
import { commentLatestCommand } from "./latest.js";
import { commentGetCommand } from "./get.js";
import { commentAddCommand } from "./add.js";
import { commentEditCommand } from "./edit.js";
import { commentDeleteCommand } from "./delete.js";
import { commentFileCommand } from "./file/index.js";

export const postCommentCommand = new Command("comment").description("댓글 관련 명령");

postCommentCommand.addCommand(commentListCommand);
postCommentCommand.addCommand(commentLatestCommand);
postCommentCommand.addCommand(commentGetCommand);
postCommentCommand.addCommand(commentAddCommand);
postCommentCommand.addCommand(commentEditCommand);
postCommentCommand.addCommand(commentDeleteCommand);
postCommentCommand.addCommand(commentFileCommand);
