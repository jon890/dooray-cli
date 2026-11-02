import { Command } from "commander";
import { streamListCommand } from "./list.js";

export const streamCommand = new Command("stream")
  .description("두레이 활동(피드) 관련 명령");

streamCommand.addCommand(streamListCommand);
