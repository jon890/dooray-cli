/**
 * `dooray calendar event edit` — 일정 수정. `PUT calendar/v1/calendars/{calendar-id}/events/{event-id}`.
 *
 * 사용자가 준 옵션의 필드만 보낸다. 기존 값으로 채우는 규칙과 경고는 `event-edit-rules.ts` 가 갖는다.
 * 시각은 기존 값을 조회하지 않는다. 그래서 종일 일정도 `--start` 와 `--end` 를 함께 줘야 한다.
 * `$EDITOR` 로 폴백하지 않는다. 일정에는 편집기로 고칠 하나의 본문이 아니라 필드가 여럿이다.
 */

import { Command } from "commander";
import { getConfigOrThrow } from "../../config/store.js";
import { createClient } from "../../api/dooray-client.js";
import type { CalendarEventWriteRequest } from "@/api/calendar/types.js";
import type { OutputOptions } from "../../formatters/table.js";
import { printJson } from "../../formatters/table.js";
import {
  formatCalendarLabel,
  resolveWritableCalendar,
  type ResolvedCalendar,
} from "../../resolvers/calendar.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { type DroppedRecurrenceField, isEmptyEventRequest } from "./event-request.js";
import {
  mergeExistingEventFields,
  nothingToEdit,
  rejectInstanceId,
  warnPersonalSettingsReset,
  warnRecurrenceDropped,
  warnUnreadableZone,
} from "./event-edit-rules.js";
import {
  addEventFieldOptions,
  type EventFieldOptions,
  hasEventFieldOption,
  prepareEventFields,
  resolveEventRequest,
  warnDryRunOutputOptions,
} from "./event-write.js";

export const calendarEventEditCommand = addEventFieldOptions(
  new Command("edit")
    .description("일정 수정 (준 옵션의 필드만 바꾼다. 반복 일정 회차 id 는 받지 않는다)")
    .argument("<calendar>", "캘린더 ID 또는 이름 (calendar list 로 확인)")
    .argument("<event-id>", "일정 ID (calendar event list --quiet 으로 확인)"),
).action(async (calendarInput: string, eventId: string, opts: EventFieldOptions) => {
  const globalOpts = calendarEventEditCommand.optsWithGlobals() as OutputOptions;

  rejectInstanceId(eventId);
  if (!hasEventFieldOption(opts)) throw nothingToEdit();
  const prepared = await prepareEventFields(opts, "edit");
  if (opts.dryRun) warnDryRunOutputOptions(globalOpts);
  warnPersonalSettingsReset(opts);

  const config = await getConfigOrThrow();
  const client = createClient(config);

  startSpinner(opts.dryRun ? "이름 해석 중..." : "일정 수정 중...");
  let calendar: ResolvedCalendar;
  let request: CalendarEventWriteRequest;
  let recurrenceDropped: DroppedRecurrenceField[] = [];
  let unreadableZone: string | undefined;
  try {
    calendar = await resolveWritableCalendar(client, calendarInput);
    request = await resolveEventRequest(client, prepared, "edit");
    ({ request, recurrenceDropped, unreadableZone } = await mergeExistingEventFields(
      client,
      calendar.id,
      eventId,
      request,
      opts,
    ));
  } catch (e) {
    stopSpinner(false);
    throw e;
  }
  // `--body ""` 처럼 옵션은 있으나 보낼 값이 비는 경우. 빈 요청을 보내면 아무것도 안 바뀌고 성공만 돌아온다.
  if (isEmptyEventRequest(request)) {
    stopSpinner(false);
    throw nothingToEdit();
  }
  const calendarLabel = formatCalendarLabel(calendar);

  // 스피너가 stderr 에 그리는 동안 쓰면 경고가 지워질 수 있어, 스피너를 멈춘 뒤에 알린다.
  if (opts.dryRun) {
    stopSpinner(true, `dry-run: ${calendarLabel} 의 일정 ${eventId} 에 보낼 요청입니다. API 는 부르지 않았습니다.`);
    warnRecurrenceDropped(recurrenceDropped, request.recurrenceRule?.frequency);
    warnUnreadableZone(unreadableZone);
    printJson(request);
    return;
  }

  let raw: unknown;
  try {
    const res = await client.updateCalendarEvent(calendar.id, eventId, request);
    raw = res.result;
  } catch (e) {
    stopSpinner(false);
    throw e;
  }
  stopSpinner(true, "일정 수정 완료");
  warnRecurrenceDropped(recurrenceDropped, request.recurrenceRule?.frequency);
  warnUnreadableZone(unreadableZone);

  if (globalOpts.json) {
    printJson(raw ?? null);
  } else if (globalOpts.quiet) {
    process.stdout.write(eventId + "\n");
  } else {
    process.stdout.write(`일정을 수정했습니다: ${eventId} (캘린더: ${calendarLabel})\n`);
  }
});
