/**
 * 일정 쓰기 명령의 `<calendar>` 입력을 캘린더로 해석한다.
 *
 * 15자리 이상 숫자는 id 로 그대로 쓰고 목록을 조회하지 않는다. 존재와 권한 확인은 뒤이은 쓰기 API 에 맡긴다.
 * 그 밖의 값은 캘린더 목록에서 이름으로 찾는다(정확일치 → 부분일치 → 모호하면 후보 목록과 함께 오류).
 * 구독 캘린더(`subscription`)는 외부에서 가져온 읽기 전용 캘린더라 이름 후보에서 뺀다.
 */

import type { DoorayApiClient } from "../api/client.js";
import type { Calendar } from "../api/types.js";
import { sanitizeForTerminal } from "../utils/sanitize.js";
import { matchByName } from "./match.js";

const CALENDAR_ID_RE = /^\d{15,}$/;

/** 쓰기 대상에서 빼는 캘린더 종류. */
const READ_ONLY_CALENDAR_TYPES = new Set(["subscription"]);

export interface ResolvedCalendar {
  id: string;
  /** 이름으로 찾았을 때만 있다. id 로 받으면 목록을 조회하지 않아 이름을 모른다. */
  name?: string;
}

export async function resolveWritableCalendar(
  client: DoorayApiClient,
  input: string,
): Promise<ResolvedCalendar> {
  if (CALENDAR_ID_RE.test(input)) return { id: input };

  const res = await client.getCalendars();
  const candidates = (res.result ?? [])
    .filter((c: Calendar) => !READ_ONLY_CALENDAR_TYPES.has(c.type ?? ""))
    .filter((c): c is Calendar & { name: string } => !!c.name)
    .map((c) => ({ id: c.id, name: c.name }));

  const match = matchByName(candidates, input, "캘린더", (c) => `${c.name} (${c.id})`, {
    helpHint: "dooray calendar list — 구독 캘린더는 일정을 쓸 수 없어 이름 후보에서 빠진다",
  });
  return { id: match.id, name: match.name };
}

/** 출력에 쓸 캘린더 표기. 이름을 알면 `이름 (id)`, id 로만 받았으면 id. 이름은 외부 문자열이라 control char 를 없앤다. */
export function formatCalendarLabel(calendar: ResolvedCalendar): string {
  return calendar.name ? `${sanitizeForTerminal(calendar.name)} (${calendar.id})` : calendar.id;
}
