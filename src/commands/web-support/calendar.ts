export const calendarWebAreaName = "캘린더";
/** calendar 웹 지원 목록. 참석자·참조자를 넣는 쓰기는 웹에서 실측하지 못해 막는다. */
export const calendarWebSupport: Readonly<Record<string, readonly string[]>> = {
  "calendar list": [],
  "calendar event list": [],
  "calendar event get": [],
  "calendar event create": ["to", "cc"],
  "calendar event edit": ["to", "cc"],
  "calendar event delete": [],
} as const;
