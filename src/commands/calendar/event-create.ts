/**
 * `dooray calendar event create` — 일정 생성. `POST calendar/v1/calendars/{calendar-id}/events`.
 *
 * 캘린더는 id 나 이름으로 받는다. 날짜만 준 `--start` 는 종일 일정이고, 일시는 offset 이 붙어야 한다.
 * 본문이 없으면 빈 본문으로 만든다(create 계열이라 `$EDITOR` 를 열지 않는다). 서버가 `users`·`body` 키를
 * 요구하므로(실측) 값이 비어도 두 키는 실린다.
 * `--dry-run` 은 이름 해석까지 하고 쓰기 API 를 부르지 않은 채 요청 본문을 출력한다.
 */

import { Command } from "commander";
import { getConfigOrThrow } from "../../config/store.js";
import { DoorayApiClient } from "../../api/client.js";
import type { OutputOptions } from "../../formatters/table.js";
import { printJson } from "../../formatters/table.js";
import { formatCalendarLabel, resolveWritableCalendar } from "../../resolvers/calendar.js";
import { DoorayCliError } from "../../utils/errors.js";
import { EXIT_API_ERROR, EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import {
  addEventFieldOptions,
  type EventFieldOptions,
  prepareEventFields,
  resolveEventRequest,
  warnDryRunOutputOptions,
} from "./event-write.js";

export const calendarEventCreateCommand = addEventFieldOptions(
  new Command("create")
    .description("일정 생성 (--title, --start 필수)")
    .argument("<calendar>", "캘린더 ID 또는 이름 (calendar list 로 확인)"),
).action(async (calendarInput: string, opts: EventFieldOptions) => {
  const globalOpts = calendarEventCreateCommand.optsWithGlobals() as OutputOptions;

  if (opts.title == null || opts.title.trim() === "") {
    throw new DoorayCliError("--title 은 필수입니다.", EXIT_PARAM_ERROR);
  }
  if (opts.start == null) {
    throw new DoorayCliError(
      "--start 는 필수입니다. 종일 일정은 YYYY-MM-DD, 일반 일정은 2026-09-20T09:00:00+09:00 처럼 주세요.",
      EXIT_PARAM_ERROR,
    );
  }
  const prepared = await prepareEventFields(opts, "create");
  if (opts.dryRun) warnDryRunOutputOptions(globalOpts);

  const config = await getConfigOrThrow();
  const client = new DoorayApiClient(config.apiKey, config.baseUrl);

  startSpinner(opts.dryRun ? "이름 해석 중..." : "일정 생성 중...");
  let calendar;
  let request;
  try {
    calendar = await resolveWritableCalendar(client, calendarInput);
    request = await resolveEventRequest(client, prepared, "create");
  } catch (e) {
    stopSpinner(false);
    throw e;
  }
  const calendarLabel = formatCalendarLabel(calendar);

  if (opts.dryRun) {
    stopSpinner(true, `dry-run: ${calendarLabel} 에 보낼 요청입니다. API 는 부르지 않았습니다.`);
    printJson(request);
    return;
  }

  let id: string;
  let raw: unknown;
  try {
    const res = await client.createCalendarEvent(calendar.id, request);
    raw = res.result;
    if (res.result?.id == null) {
      // 성공 응답인데 id 가 없다. 일정은 만들어졌을 수 있으니 다시 실행해 중복을 만들지 않게 알린다.
      throw new DoorayCliError(
        "일정 생성 응답에 id 가 없습니다. 일정이 만들어졌을 수 있으니 다시 실행하기 전에 " +
          "calendar event list 로 확인하세요.",
        EXIT_API_ERROR,
      );
    }
    id = res.result.id;
  } catch (e) {
    stopSpinner(false);
    throw e;
  }
  stopSpinner(true, "일정 생성 완료");

  if (globalOpts.json) {
    printJson(raw);
  } else if (globalOpts.quiet) {
    process.stdout.write(id + "\n");
  } else {
    process.stdout.write(`일정을 만들었습니다: ${id} (캘린더: ${calendarLabel})\n`);
  }
});
