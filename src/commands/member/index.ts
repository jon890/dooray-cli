import { Command } from "commander";
import { memberGetCommand } from "./get.js";
import { memberListCommand } from "./list.js";
import { memberSearchCommand } from "./search.js";

export const memberCommand = new Command("member")
  .description("Dooray 멤버 조회");
memberCommand.addCommand(memberGetCommand);
memberCommand.addCommand(memberListCommand);
memberCommand.addCommand(memberSearchCommand);
