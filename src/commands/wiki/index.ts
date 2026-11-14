import { Command } from "commander";
import { wikiListCommand } from "./list.js";
import { wikiPagesCommand } from "./pages.js";
import { wikiTreeCommand } from "./tree.js";
import { wikiPageGetCommand } from "./page-get.js";
import { wikiPageCreateCommand } from "./page-create.js";
import { wikiPageEditCommand } from "./page-edit.js";
import { wikiPageReplaceCommand } from "./page-replace.js";
import { wikiPageDeleteCommand } from "./page-delete.js";
import { wikiPageMoveCommand } from "./page-move.js";
import { wikiPageFileCommand } from "./page-file/index.js";
import { wikiPageCommentCommand } from "./page-comment/index.js";

export const wikiCommand = new Command("wiki").description("위키 관련 명령");

wikiCommand.addCommand(wikiListCommand);
wikiCommand.addCommand(wikiPagesCommand);
wikiCommand.addCommand(wikiTreeCommand);

const wikiPageCommand = new Command("page").description("위키 페이지 관련 명령");
wikiPageCommand.addCommand(wikiPageGetCommand);
wikiPageCommand.addCommand(wikiPageCreateCommand);
wikiPageCommand.addCommand(wikiPageEditCommand);
wikiPageCommand.addCommand(wikiPageReplaceCommand);
wikiPageCommand.addCommand(wikiPageDeleteCommand);
wikiPageCommand.addCommand(wikiPageMoveCommand);
wikiPageCommand.addCommand(wikiPageFileCommand);
wikiPageCommand.addCommand(wikiPageCommentCommand);
wikiCommand.addCommand(wikiPageCommand);
