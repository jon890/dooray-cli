/**
 * `dooray calendar` 명령 조립. `list` 와 `event` 서브커맨드 그룹을 단다.
 * `event` 아래에는 읽기(`list`·`get`)와 쓰기(`create`·`edit`·`delete`)가 함께 있다.
 */

import { Command } from "commander";
import { calendarListCommand } from "./list.js";
import { calendarEventListCommand } from "./event-list.js";
import { calendarEventGetCommand } from "./event-get.js";
import { calendarEventCreateCommand } from "./event-create.js";
import { calendarEventEditCommand } from "./event-edit.js";
import { calendarEventDeleteCommand } from "./event-delete.js";

export const calendarCommand = new Command("calendar").description("캘린더 관련 명령");

calendarCommand.addCommand(calendarListCommand);

// event 서브커맨드 그룹 (post comment 의 중첩 방식과 동일)
const calendarEventCommand = new Command("event").description("일정 관련 명령");
calendarEventCommand.addCommand(calendarEventListCommand);
calendarEventCommand.addCommand(calendarEventGetCommand);
calendarEventCommand.addCommand(calendarEventCreateCommand);
calendarEventCommand.addCommand(calendarEventEditCommand);
calendarEventCommand.addCommand(calendarEventDeleteCommand);
calendarCommand.addCommand(calendarEventCommand);
