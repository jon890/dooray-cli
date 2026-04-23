/**
 * Dooray API의 `header.resultMessage`는 URL-encoded (form-encoded) 상태로
 * 내려오는 경우가 있어, 출력 전에 사람이 읽을 수 있는 형태로 정규화한다.
 *
 * - `+` 는 form-encoding 관례에 따라 공백으로 치환 후 디코딩
 * - 디코딩 실패(malformed escape)시 원문 그대로 반환
 */
export function normalizeDoorayMessage(raw: string): string {
  try {
    return decodeURIComponent(raw.replace(/\+/g, " "));
  } catch {
    return raw;
  }
}
