/**
 * 일정 수정의 규칙. `calendar event edit` 가 쓴다.
 *
 * 서버는 빈 값이 아닌 필드만 반영하므로(공식 문서) 사용자가 준 옵션의 필드만 보낸다. 다만 `users` 는 통째로 바뀌므로(실측)
 * `--to`·`--cc` 중 한쪽만 주면 상세를 조회해 다른 쪽을 기존 값으로 채운다.
 * 반복 일정 회차 id 는 거부한다. 회차 id 로 수정하면 남은 회차 전체가 바뀐다(실측).
 * `personalSettings`(알림·비공개)도 통째로 바뀌는데 상세 응답에 없어 채울 수 없으므로, 지워질 설정을 stderr 로 알린다.
 * `recurrenceRule` 도 통째로 바뀐다(실측). `--repeat` 을 주면 상세를 조회해, 주기가 같을 때 주지 않은 세부 옵션을 기존 값으로 채운다.
 */

import type { CalendarClient, CalendarEventWriteRequest } from "@/api/calendar/types.js";
import { DoorayCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
import { isDateOnlyForm } from "../../utils/local-date.js";
import { sanitizeForTerminal } from "../../utils/sanitize.js";
import {
  type DroppedRecurrenceField,
  instanceOriginalId,
  mergeExistingRecurrence,
  mergeExistingUsers,
  needsExistingUsers,
} from "./event-request.js";
import type { EventFieldOptions } from "./event-write.js";

export function nothingToEdit(): DoorayCliError {
  return new DoorayCliError(
    "수정할 항목이 없습니다. --title, --start, --body, --location, --to 같은 옵션을 하나 이상 주세요.",
    EXIT_PARAM_ERROR,
  );
}

/** 회차 id 를 API 호출 전에 거부한다. 경고만 하고 진행하면 사용자가 뜻하지 않은 범위가 조용히 바뀐다. */
export function rejectInstanceId(eventId: string): void {
  const originalId = instanceOriginalId(eventId);
  if (originalId == null) return;
  throw new DoorayCliError(
    `반복 일정의 회차 id 입니다: ${eventId}\n` +
      "회차 하나만 고칠 수 없고, 회차 id 로 수정하면 남은 반복 전체가 바뀝니다.\n" +
      `반복 전체를 고치려면 원본 id(${originalId}) 로 다시 실행하세요.`,
    EXIT_PARAM_ERROR,
  );
}

/**
 * 수정에서 지워질 수 있는 개인 설정을 stderr 로 알린다.
 *
 * 서버는 `personalSettings` 를 통째로 바꾸고(실측) 상세 응답에는 그 값이 없어 기존 값을 채워 보낼 수 없다.
 * `--alarm` 만 주면 비공개가 공개로, `--private` 만 주면 알림이 모두 지워진다.
 * 일반 일정을 종일로 바꿔도 알림이 지워진다(실측). 기존 일정이 일반인지 모르므로 종일 시각을 주면 알린다.
 */
export function warnPersonalSettingsReset(opts: EventFieldOptions): void {
  const hasAlarm = (opts.alarm ?? []).length > 0;
  const isPrivate = opts.private === true;
  if (hasAlarm && !isPrivate) {
    process.stderr.write(
      "⚠  --alarm 만 주면 비공개 일정이 공개로 바뀝니다. 비공개를 유지하려면 --private 를 함께 주세요.\n",
    );
  }
  if (isPrivate && !hasAlarm) {
    process.stderr.write(
      "⚠  --private 만 주면 기존 알림이 모두 지워집니다. 알림을 유지하려면 --alarm 을 함께 주세요.\n",
    );
  }
  if (!hasAlarm && opts.start != null && isDateOnlyForm(opts.start)) {
    process.stderr.write(
      "⚠  일반 일정을 종일로 바꾸면 기존 알림이 지워집니다. 알림이 필요하면 --alarm 을 함께 주세요.\n",
    );
  }
}

/** 서버 값을 옵션 인자로 붙여 넣을 수 있게 쓴다. 셸이 다르게 읽을 글자가 있으면 작은따옴표로 감싼다. */
function shellArg(value: unknown): string {
  const text = sanitizeForTerminal(typeof value === "string" ? value : JSON.stringify(value));
  return /^[A-Za-z0-9,:+._-]+$/.test(text) ? text : `'${text.replace(/'/g, "'\\''")}'`;
}

/**
 * 반복 규칙 수정으로 지워질 기존 필드를 stderr 로 알린다.
 * 서버는 `recurrenceRule` 을 통째로 바꾼다(실측). 주기가 같으면 빠진 필드를 기존 값으로 채우지만,
 * 주기를 바꾸면 `until` 밖의 세부 필드를, CLI 가 다루지 않는 필드는 주기와 상관없이 채우지 않는다.
 * 실제 수정에서는 이 경고가 수정이 끝난 뒤에 나오므로, 지워진 값을 되살릴 옵션을 원래 값과 함께 보여준다.
 * `--repeat-*` 는 `--repeat` 없이 받지 않으므로 이번에 보낸 빈도를 앞에 붙여, 보여준 옵션을 그대로 다시 실행할 수 있게 한다.
 */
export function warnRecurrenceDropped(dropped: DroppedRecurrenceField[], frequency: string | undefined): void {
  if (dropped.length === 0) return;
  // 필드 이름도 서버 응답의 키라 제어 문자를 지운다.
  const field = (d: DroppedRecurrenceField): string => sanitizeForTerminal(d.field);
  const lines = [`⚠  이 수정으로 기존 반복 규칙의 ${dropped.map(field).join(", ")} 이(가) 지워집니다.`];
  const restorable = dropped.filter((d) => d.flag != null).map((d) => `${d.flag} ${shellArg(d.value)}`);
  if (restorable.length > 0) {
    const repeat = frequency != null ? `--repeat ${shellArg(frequency)} ` : "";
    lines.push(`   지금 값을 유지하려면 이 옵션으로 다시 실행합니다: ${repeat}${restorable.join(" ")}`);
  }
  const webOnly = dropped.filter((d) => d.flag == null).map((d) => `${field(d)}=${shellArg(d.value)}`);
  if (webOnly.length > 0) lines.push(`   ${webOnly.join(", ")} 은(는) CLI 로 다시 줄 수 없어 웹에서 설정합니다.`);
  process.stderr.write(lines.join("\n") + "\n");
}

/** 일정의 반복 시간대를 읽지 못해 날짜만 준 종료일을 장비 시간대로 넓혔으면 stderr 로 알린다. */
export function warnUnreadableZone(zone: string | undefined): void {
  if (zone == null) return;
  process.stderr.write(
    `⚠  일정의 시간대 ${sanitizeForTerminal(zone)} 를 읽지 못해 --repeat-until 을 이 컴퓨터의 시간대 기준으로 넓혔습니다. ` +
      "마지막 날 회차를 맞추려면 --repeat-until 에 offset 이 붙은 시각을 줍니다.\n",
  );
}

export interface MergedEditRequest {
  request: CalendarEventWriteRequest;
  /** 이 수정으로 지워질 기존 반복 규칙 필드. */
  recurrenceDropped: DroppedRecurrenceField[];
  /** 일정의 반복 시간대를 읽지 못해 장비 시간대로 넓혔을 때의 그 시간대. */
  unreadableZone: string | undefined;
}

/**
 * 통째로 바뀌는 `users` 와 `recurrenceRule` 을 기존 값으로 채운다. 상세 조회는 둘 중 하나가 필요할 때만 한다.
 * dry-run 도 같은 조회를 해서 실제로 보낼 본문을 보여준다.
 */
export async function mergeExistingEventFields(
  client: CalendarClient,
  calendarId: string,
  eventId: string,
  request: CalendarEventWriteRequest,
  opts: EventFieldOptions,
): Promise<MergedEditRequest> {
  let merged = request;
  let recurrenceDropped: DroppedRecurrenceField[] = [];
  let unreadableZone: string | undefined;
  if (needsExistingUsers(request) || request.recurrenceRule != null) {
    const existing = (await client.getCalendarEvent(calendarId, eventId)).result;
    merged = mergeExistingUsers(request, existing?.users);
    if (merged.recurrenceRule != null) {
      const recurrence = mergeExistingRecurrence(merged.recurrenceRule, opts, existing?.recurrenceRule);
      merged = { ...merged, recurrenceRule: recurrence.rule };
      recurrenceDropped = recurrence.dropped;
      unreadableZone = recurrence.unreadableZone;
    }
  }
  return { request: merged, recurrenceDropped, unreadableZone };
}
