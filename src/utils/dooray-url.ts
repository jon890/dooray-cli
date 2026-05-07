const TASK_URL_RE = /^https?:\/\/[\w.-]+\.dooray\.com\/task\/to\/(\d+)(?:[/?#].*)?$/;
// alt: /task/<projectId>/<postId> form (자체 호스팅 / 브라우저 주소창 복사)
// projectId 는 비캡처 — `parseDoorayTaskUrl` 시그니처가 string|null 단일 반환이라 사용 안 함.
// postId 가 캡처 1 이 되어 short form (`m1[1]`) 과 인덱스 일관.
const TASK_URL_ALT_RE = /^https?:\/\/[\w.-]+\.dooray\.com\/task\/(?:\d+)\/(\d+)(?:[/?#].*)?$/;

export function parseDoorayTaskUrl(input: string): string | null {
  const m1 = TASK_URL_RE.exec(input);
  if (m1) return m1[1];
  const m2 = TASK_URL_ALT_RE.exec(input);
  if (m2) return m2[1];
  return null;
}

export function isLikelyDoorayUrl(input: string): boolean {
  return /^https?:\/\//.test(input);
}
