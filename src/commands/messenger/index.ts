import { Command } from "commander";
import { messengerSendCommand } from "./send.js";
import { messengerChannelSendCommand } from "./channel-send.js";

export const messengerCommand = new Command("messenger")
  .description("메신저 관련 명령");

messengerCommand.addCommand(messengerSendCommand);
messengerCommand.addCommand(messengerChannelSendCommand);
