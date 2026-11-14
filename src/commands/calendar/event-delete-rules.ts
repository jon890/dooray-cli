/**
 * 일정 삭제의 규칙. `calendar event delete` 가 쓴다.
 *
 * `--scope` 와 API 의 `deleteType` 대응, 확인 문구에 넣을 일정 요약, 반복 일정 원본 id 의 거부를 맡는다.
 * 반복 일정의 원본 id 에 `this` 를 주면 그 회차가 아니라 반복 전체가 지워진다(실측). 기본값이 `this` 라
 * `--scope` 를 생략한 삭제가 시리즈를 통째로 지우므로, 상세를 조회해 반복 일정이면 확인을 묻기 전에 거부한다.
 */

import type { CalendarClient, CalendarEventDeleteType, CalendarEventDetail } from "@/api/calendar/types.js";
import type { ResolvedCalendar } from "../../resolvers/calendar.js";
import { DoorayCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
import { sanitizeForTerminal } from "../../utils/sanitize.js";
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

export const SCOPE_LABEL: Record<DeleteScope, string> = {
  this: "",
  "from-this": " 이 회차부터 이후 반복 전체를 지웁니다.",
  all: " 반복 일정 전체를 지웁니다.",
};

export interface DeleteContext {
  client: CalendarClient;
  calendar: ResolvedCalendar;
}

export function summarizeEvent(event: CalendarEventDetail, eventId: string): string {
  const subject = sanitizeForTerminal(event.subject ?? "");
  return `"${subject}" ${formatEventTime(event)} (${eventId})`;
}

/** 확인 문구에 넣을 제목과 시각. 조회가 실패해도 삭제 확인은 막지 않고 id 만 보여준다. */
export async function describeEvent(ctx: DeleteContext, eventId: string): Promise<string> {
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
