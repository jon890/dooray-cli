import { Command } from "commander";
import { mailListCommand } from "./list.js";
import { mailGetCommand } from "./get.js";
import { mailAttachmentCommand } from "./attachment.js";
import { mailSendCommand } from "./send.js";
import { mailReplyCommand } from "./reply.js";
import { mailLogoutCommand } from "./logout.js";

export const mailCommand = new Command("mail").description("메일 관련 명령");

mailCommand.addCommand(mailListCommand);
mailCommand.addCommand(mailGetCommand);
mailCommand.addCommand(mailAttachmentCommand);
mailCommand.addCommand(mailSendCommand);
mailCommand.addCommand(mailReplyCommand);
mailCommand.addCommand(mailLogoutCommand);
