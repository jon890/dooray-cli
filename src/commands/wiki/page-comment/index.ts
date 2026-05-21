import { Command } from "commander";
import { wikiPageCommentListCommand } from "./list.js";
import { wikiPageCommentLatestCommand } from "./latest.js";
import { wikiPageCommentGetCommand } from "./get.js";
import { wikiPageCommentAddCommand } from "./add.js";
import { wikiPageCommentEditCommand } from "./edit.js";
import { wikiPageCommentDeleteCommand } from "./delete.js";

export const wikiPageCommentCommand = new Command("comment")
  .description("위키 페이지 댓글 관련 명령");

wikiPageCommentCommand.addCommand(wikiPageCommentListCommand);
wikiPageCommentCommand.addCommand(wikiPageCommentLatestCommand);
wikiPageCommentCommand.addCommand(wikiPageCommentGetCommand);
wikiPageCommentCommand.addCommand(wikiPageCommentAddCommand);
wikiPageCommentCommand.addCommand(wikiPageCommentEditCommand);
wikiPageCommentCommand.addCommand(wikiPageCommentDeleteCommand);
