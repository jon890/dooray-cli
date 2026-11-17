/**
 * 서버가 준 ISO8601 시각 문자열을 표에 넣을 짧은 형태로 바꾸는 표시용 함수.
 *
 * 메신저 `logs` 의 보낸 시각과 `channels` 의 수정 시각(updatedAt)이 같은 규칙으로 보이도록 여기 둔다.
 */

/**
 * `2026-09-18T11:38:11+09:00` → `2026-09-18 11:38`. 콜론 없는 `+0900`(웹 스트림 `calendar`·`project` 의 `at`)도 같다.
 *
 * `Date` 로 파싱하지 않는다 — 파싱하면 서버가 준 offset 기준 시각이
 * 실행 장비의 타임존으로 밀려 보인다.
 * 다만 offset 을 떼는 것은 `+09:00`·`+0900` 일 때뿐이다. 다른 offset 이나 `Z` 를
 * 떼면 그 시각을 KST 로 오독하므로 원형을 그대로 보여준다.
 */
export function formatSentAt(sentAt?: string): string {
  if (!sentAt) return "";
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}):\d{2}(?:\.\d+)?\+09:?00$/.exec(sentAt);
  return m ? `${m[1]} ${m[2]}` : sentAt;
}
