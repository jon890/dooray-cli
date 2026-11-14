/**
 * 일정 목록의 `me` 로 "내가 이 일정에 어떻게 들어가 있는가" 를 한국어로 적는다.
 *
 * `userType` 이 없으면 내가 참여자가 아닌 일정(공유받은 캘린더의 남의 일정)이라 빈 칸이다.
 * 알 수 없는 값은 원형을 그대로 보여주되 외부 문자열이라 control char 를 없앤다.
 */

import type { CalendarEventMe } from "@/api/calendar/types.js";
import { sanitizeForTerminal } from "../../utils/sanitize.js";

const USER_TYPE_LABELS: Record<string, string> = {
  from: "주최",
  to: "참석",
  cc: "참조",
};

const STATUS_LABELS: Record<string, string> = {
  accepted: "수락",
  declined: "거절",
  tentative: "미정",
  not_confirmed: "미응답",
};

function label(labels: Record<string, string>, value: string): string {
  return Object.hasOwn(labels, value) ? labels[value]! : sanitizeForTerminal(value);
}

/**
 * `{ userType: "to", status: "accepted" }` → `참석·수락`.
 *
 * 등록자(`from`)는 수락이 당연해(실측 `accepted`) `주최` 만 적는다.
 * 수락이 아닌 응답이 오면 그때만 붙인다.
 */
export function formatParticipation(me: CalendarEventMe | null | undefined): string {
  const userType = me?.userType;
  if (userType == null || userType === "") return "";

  const role = label(USER_TYPE_LABELS, userType);
  const status = me?.status;
  if (status == null || status === "") return role;
  if (userType === "from" && status === "accepted") return role;
  return `${role}·${label(STATUS_LABELS, status)}`;
}
