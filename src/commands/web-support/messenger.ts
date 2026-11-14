export const messengerWebAreaName = "메신저";
/** messenger 웹 지원 목록. 다른 사람의 대화방에 보내는 경로는 나에게 보내는 것과 같은 요청이지만 실측 장소 규칙상 확인하지 못했다. */
export const messengerWebSupport: Readonly<Record<string, readonly string[]>> = {
  "messenger channels": [],
  "messenger logs": [],
  "messenger send": [],
  "messenger channel-send": [],
  "messenger thread-send": [],
  "messenger file download": [],
} as const;
