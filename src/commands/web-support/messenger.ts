export const messengerWebAreaName = "메신저";
/** messenger 웹 지원 목록. 읽기만 실측했다. 보내기·스레드·파일 받기는 웹 경로를 찾으면 더한다. */
export const messengerWebSupport: Readonly<Record<string, readonly string[]>> = {
  "messenger channels": [],
  "messenger logs": [],
} as const;
