import { Command } from "commander";
import { messengerSendCommand } from "./send.js";
import { messengerChannelSendCommand } from "./channel-send.js";
import { messengerThreadSendCommand } from "./thread-send.js";
import { messengerLogsCommand } from "./logs.js";
import { messengerChannelsCommand } from "./channels.js";
import { messengerFileCommand } from "./file/index.js";

export const messengerCommand = new Command("messenger")
  .description("메신저 관련 명령");

messengerCommand.addCommand(messengerSendCommand);
messengerCommand.addCommand(messengerChannelSendCommand);
messengerCommand.addCommand(messengerThreadSendCommand);
messengerCommand.addCommand(messengerLogsCommand);
messengerCommand.addCommand(messengerChannelsCommand);
messengerCommand.addCommand(messengerFileCommand);
