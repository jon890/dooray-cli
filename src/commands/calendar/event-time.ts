/**
 * `formatEventTime` — `event list` 와 `event get` 이 공유하는 시각 열 빌더.
 *
 * 종일 일정의 날짜만 형식(`2026-09-18+09:00`)을 따로 받고, `endedAt` 이 그 날을 포함하지 않아
 * 마지막 날을 하루 앞으로 잡는다. 폴백이 서버 문자열을 그대로 돌려주므로 반환 직전 control char 를 없앤다.
 */

import type { CalendarEvent } from "@/api/calendar/types.js";
import { sanitizeForTerminal } from "../../utils/sanitize.js";

/**
 * `2026-09-20T14:00:00+09:00` → `{ date: "2026-09-20", time: "14:00" }`.
 *
 * `Date` 로 파싱하지 않는다 — 파싱하면 서버가 준 offset 기준 시각이
 * 실행 장비의 타임존으로 밀려 보인다.
 * offset 을 떼는 것은 `+09:00` 일 때뿐이다. 다른 offset 이나 `Z` 를 떼면
 * 그 시각을 KST 로 오독하므로 원형을 그대로 보여준다.
 */
function splitStamp(value: string): { date: string; time: string } | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}):\d{2}(?:\.\d+)?\+09:00$/.exec(value);
  return m ? { date: m[1]!, time: m[2]! } : null;
}

/**
 * 종일 일정의 `2026-09-18+09:00` → `2026-09-18`.
 *
 * 종일 일정은 시각 없이 날짜와 offset 만 온다. 일반 일정과 형식이 다르다.
 * 일반 일정과 같은 이유로 `+09:00` 일 때만 offset 을 뗀다.
 */
function splitDateStamp(value: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})\+09:00$/.exec(value);
  return m ? m[1]! : null;
}

/**
 * `2026-09-19` → `2026-09-18`.
 *
 * 지역 시간대를 거치지 않으려고 UTC 자정으로 세운 뒤 하루를 뺀다.
 * UTC 에는 서머타임이 없어 하루가 항상 24시간이고, 윤년과 월말은 `Date` 가 처리한다.
 */
function previousDay(date: string): string {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  const at = new Date(Date.UTC(year, month - 1, day));
  at.setUTCDate(at.getUTCDate() - 1);
  return at.toISOString().slice(0, 10);
}

function build(event: CalendarEvent): string {
  const startedAt = event.startedAt ?? "";
  const endedAt = event.endedAt ?? "";

  if (event.wholeDayFlag === true) {
    const first = startedAt === "" ? null : splitDateStamp(startedAt);
    if (first == null) return startedAt === "" ? "(종일)" : `${startedAt} (종일)`;

    const endDay = endedAt === "" ? null : splitDateStamp(endedAt);
    if (endDay == null) return `${first} (종일)`;

    const last = previousDay(endDay);
    // 하루짜리는 last 가 first 와 같다. 어긋난 데이터로 last 가 앞서면 기간을 그리지 않는다.
    return last > first ? `${first} ~ ${last} (종일)` : `${first} (종일)`;
  }

  const start = startedAt === "" ? null : splitStamp(startedAt);
  const end = endedAt === "" ? null : splitStamp(endedAt);

  if (start && end) {
    return start.date === end.date
      ? `${start.date} ${start.time}-${end.time}`
      : `${start.date} ${start.time} ~ ${end.date} ${end.time}`;
  }
  if (start && endedAt === "") return `${start.date} ${start.time}`;

  // 한쪽이라도 해석되지 않으면 짝을 맞추지 않고 원형을 그대로 낸다.
  return endedAt === "" ? startedAt : `${startedAt} ~ ${endedAt}`;
}

/**
 * 일정의 시각 열 문자열.
 *
 * - 종일 일정의 `endedAt` 은 그 날을 포함하지 않는다(실측). 마지막 날은 하루 앞이라
 *   하루짜리는 날짜 하나로, 여러 날이면 기간으로 적는다.
 * - 같은 날에 끝나는 일반 일정은 날짜를 한 번만 적는다.
 * - `+09:00` 이 아닌 값은 손대지 않고 원형을 그대로 보여준다.
 *
 * 폴백 경로가 서버 문자열을 그대로 돌려주므로 control char 는 여기서 없앤다.
 * 부르는 쪽마다 감싸는 것을 잊지 않게 이 함수가 경계를 가진다
 * (pitfalls: unsanitized-external-string-output).
 */
export function formatEventTime(event: CalendarEvent): string {
  return sanitizeForTerminal(build(event));
}
