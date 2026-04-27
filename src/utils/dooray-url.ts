const TASK_URL_RE = /^https?:\/\/[\w.-]+\.dooray\.com\/task\/to\/(\d+)(?:[/?#].*)?$/;

export function parseDoorayTaskUrl(input: string): string | null {
  const m = TASK_URL_RE.exec(input);
  return m ? m[1] : null;
}

export function isLikelyDoorayUrl(input: string): boolean {
  return /^https?:\/\//.test(input);
}
