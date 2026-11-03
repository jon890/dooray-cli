/**
 * `dooray calendar event delete` — 일정 삭제. `POST calendar/v1/calendars/{calendar-id}/events/{event-id}/delete`.
 *
 * 다른 삭제 명령과 같이 확인을 기본으로 하고 `-y`/`--yes` 로 생략한다. non-TTY 에서 `--yes` 가 없으면
 * 설정·resolver·API 호출 전에 끝난다. 확인 문구에 일정 제목과 시각을 보여주려고 상세를 조회하지만,
 * 그 조회는 확인 단계 안에서만 일어나므로 위 선차단 순서는 그대로다.
 * `--scope` 는 반복 일정에서 지울 범위다. 반복 일정의 한 회차 id 는 받은 그대로 경로에 넣는다.
 * 반복 일정의 원본 id 에 `this` 를 주면 그 회차가 아니라 반복 전체가 지워진다(실측). 기본값이 `this` 라
 * `--scope` 를 생략한 삭제가 시리즈를 통째로 지우므로, 상세를 조회해 반복 일정이면 확인을 묻기 전에 거부한다.
 */

import { Command, Option } from "commander";
import { getConfigOrThrow } from "../../config/store.js";
import { DoorayApiClient } from "../../api/client.js";
import type { CalendarEventDeleteType, CalendarEventDetail } from "../../api/types.js";
import type { OutputOptions } from "../../formatters/table.js";
import { emitDeleteResult } from "../../formatters/file-output.js";
import { resolveWritableCalendar, type ResolvedCalendar } from "../../resolvers/calendar.js";
import { authorizeDeletion, promptDeletion } from "../../utils/delete-confirmation.js";
import { DoorayCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
import { sanitizeForTerminal } from "../../utils/sanitize.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { instanceOriginalId } from "./event-request.js";
import { formatEventTime } from "./event-time.js";

export const DELETE_SCOPES = ["this", "from-this", "all"] as const;
export type DeleteScope = (typeof DELETE_SCOPES)[number];

/** CLI 의 `--scope` 값 → API 의 `deleteType`. */
export function toDeleteType(scope: DeleteScope): CalendarEventDeleteType {
  switch (scope) {
    case "this":
      return "this";
    case "from-this":
      return "wholeFromThis";
    case "all":
      return "whole";
  }
}

const SCOPE_LABEL: Record<DeleteScope, string> = {
  this: "",
  "from-this": " 이 회차부터 이후 반복 전체를 지웁니다.",
  all: " 반복 일정 전체를 지웁니다.",
};

export interface DeleteContext {
  client: DoorayApiClient;
  calendar: ResolvedCalendar;
}

function summarizeEvent(event: CalendarEventDetail, eventId: string): string {
  const subject = sanitizeForTerminal(event.subject ?? "");
  return `"${subject}" ${formatEventTime(event)} (${eventId})`;
}

/** 확인 문구에 넣을 제목과 시각. 조회가 실패해도 삭제 확인은 막지 않고 id 만 보여준다. */
async function describeEvent(ctx: DeleteContext, eventId: string): Promise<string> {
  try {
    const res = await ctx.client.getCalendarEvent(ctx.calendar.id, eventId);
    return summarizeEvent(res.result, eventId);
  } catch {
    return `일정 ${eventId}`;
  }
}

/**
 * 반복 일정의 원본 id 에 `this` 범위면 상세를 조회해 반복 일정인지 본다. 반복 일정이면 거부하고, 아니면 조회한 상세를 돌려준다.
 *
 * 원본 id 에 `this` 를 주면 반복 전체가 지워진다(실측). 이 판정은 상세 응답의 `recurrenceRule` 로만 할 수 있어,
 * 조회가 실패하면 삭제도 하지 않고 그 오류로 끝낸다. 회차 id 와 `from-this`·`all` 은 조회하지 않는다.
 */
export async function rejectSeriesDeleteByThis(
  ctx: DeleteContext,
  eventId: string,
  scope: DeleteScope,
): Promise<CalendarEventDetail | undefined> {
  if (scope !== "this" || instanceOriginalId(eventId) != null) return undefined;
  const res = await ctx.client.getCalendarEvent(ctx.calendar.id, eventId);
  const event = res.result ?? undefined;
  if (event?.recurrenceRule != null) {
    throw new DoorayCliError(
      `반복 일정의 원본 id 입니다: ${eventId}\n` +
        "원본 id 로 지우면 --scope this 여도 반복 전체가 지워집니다.\n" +
        "한 회차만 지우려면 그 회차 id(calendar event list 로 확인)를, 반복 전체를 지우려면 --scope all 을 주세요.",
      EXIT_PARAM_ERROR,
    );
  }
  return event;
}

export const calendarEventDeleteCommand = new Command("delete")
  .description("일정 삭제")
  .argument("<calendar>", "캘린더 ID 또는 이름 (calendar list 로 확인)")
  .argument("<event-id>", "일정 ID (반복 일정의 한 회차는 <eventId>-20240228T013000Z 형태 그대로)")
  .addOption(
    new Option("--scope <scope>", "반복 일정에서 지울 범위 (this: 이 회차만, from-this: 이 회차부터, all: 전체)")
      .choices(DELETE_SCOPES)
      .default("this"),
  )
  .option("-y, --yes", "확인 없이 삭제 (자동화용)")
  .action(async (calendarInput: string, eventId: string, opts) => {
    const scope = opts.scope as DeleteScope;

    // 확인 단계와 본 흐름이 같은 client·캘린더를 쓴다. 설정 로드는 확인을 통과한 뒤나 확인 안에서만 일어난다.
    let ctx: DeleteContext | undefined;
    const load = async (): Promise<DeleteContext> => {
      if (ctx != null) return ctx;
      const config = await getConfigOrThrow();
      const client = new DoorayApiClient(config.apiKey, config.baseUrl);
      const calendar = await resolveWritableCalendar(client, calendarInput);
      ctx = { client, calendar };
      return ctx;
    };

    // 원본 id 의 반복 전체 삭제는 확인을 묻기 전에 막는다. -y 로 확인을 건너뛰어도 API 전에 같은 판정을 한다.
    let guarded = false;
    const guard = async (loaded: DeleteContext): Promise<CalendarEventDetail | undefined> => {
      guarded = true;
      return rejectSeriesDeleteByThis(loaded, eventId, scope);
    };

    const confirmed = await authorizeDeletion(!!opts.yes, !!process.stdin.isTTY, async () => {
      const loaded = await load();
      const event = await guard(loaded);
      const summary = event != null ? summarizeEvent(event, eventId) : await describeEvent(loaded, eventId);
      // 반복이 아닌 일정이면 범위 문구가 필요 없다. 회차 id 의 this 는 그 회차만 지운다(실측).
      const scopeLabel =
        scope === "this" && instanceOriginalId(eventId) != null ? " 이 회차만 지웁니다." : SCOPE_LABEL[scope];
      return promptDeletion(`일정을 삭제할까요? ${summary}.${scopeLabel}`);
    });
    if (!confirmed) {
      process.stderr.write("취소되었습니다.\n");
      return;
    }

    const globalOpts = calendarEventDeleteCommand.optsWithGlobals() as OutputOptions;
    const loaded = await load();
    if (!guarded) await guard(loaded);
    const { client, calendar } = loaded;

    startSpinner("일정 삭제 중...");
    try {
      await client.deleteCalendarEvent(calendar.id, eventId, toDeleteType(scope));
    } catch (e) {
      stopSpinner(false);
      throw e;
    }
    stopSpinner(true, "삭제 완료");

    emitDeleteResult(globalOpts, {
      id: eventId,
      jsonKey: "eventId",
      message: `일정(${eventId})을 삭제했습니다.`,
    });
  });
