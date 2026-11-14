import { Command } from "commander";
import { postListCommand } from "./list.js";
import { postSearchCommand } from "./search.js";
import { postGetCommand } from "./get.js";
import { postEditCommand } from "./edit.js";
import { postReplaceCommand } from "./replace.js";
import { postCreateCommand } from "./create.js";
import { postDoneCommand } from "./done.js";
import { postWorkflowCommand } from "./workflow.js";
import { postCommentCommand } from "./comment/index.js";
import { postFileCommand } from "./file/index.js";

export const postCommand = new Command("post").description("업무 관련 명령");

postCommand.addCommand(postListCommand);
postCommand.addCommand(postSearchCommand);
postCommand.addCommand(postGetCommand);
postCommand.addCommand(postEditCommand);
postCommand.addCommand(postReplaceCommand);
postCommand.addCommand(postCreateCommand);
postCommand.addCommand(postDoneCommand);
postCommand.addCommand(postWorkflowCommand);
postCommand.addCommand(postCommentCommand);
postCommand.addCommand(postFileCommand);
