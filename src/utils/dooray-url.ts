const TASK_URL_RE = /^https?:\/\/[\w.-]+\.dooray\.com\/task\/to\/(\d+)(?:[/?#].*)?$/;
// alt: /task/<projectId>/<postId> form (자체 호스팅 / 브라우저 주소창 복사)
const TASK_URL_ALT_RE = /^https?:\/\/[\w.-]+\.dooray\.com\/task\/(\d+)\/(\d+)(?:[/?#].*)?$/;

export function parseDoorayTaskUrl(input: string): string | null {
  const m1 = TASK_URL_RE.exec(input);
  if (m1) return m1[1];
  const m2 = TASK_URL_ALT_RE.exec(input);
  if (m2) return m2[2]; // postId 만 반환 (projectId 는 path[1])
  return null;
}

export function isLikelyDoorayUrl(input: string): boolean {
  return /^https?:\/\//.test(input);
}
