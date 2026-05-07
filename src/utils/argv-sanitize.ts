/**
 * argv에서 시크릿 패턴을 자동 마스킹.
 * ADR-023 sanitization 룰 표 기준.
 */

const KEY_VALUE_PATTERNS = [
  /^(--api-key|--token|--password)=(.+)$/,
];
const SEPARATED_KEYS = new Set(["--api-key", "--token", "--password"]);

export function sanitizeArgv(argv: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];

    // --key=value 형태
    let kvMatch: RegExpMatchArray | null = null;
    for (const re of KEY_VALUE_PATTERNS) {
      const m = re.exec(a);
      if (m) { kvMatch = m; break; }
    }
    if (kvMatch) {
      out.push(`${kvMatch[1]}=***`);
      continue;
    }

    // --key value 형태 — 다음 토큰을 마스킹
    if (SEPARATED_KEYS.has(a)) {
      out.push(a);
      if (i + 1 < argv.length) {
        out.push("***");
        i++;
      }
      continue;
    }

    // Authorization: ... 형태 (단일 string에 들어있을 때)
    if (/^Authorization\s*:/i.test(a) || /^Bearer\s+\S+/.test(a)) {
      out.push(a.replace(/(Authorization\s*:\s*).+/i, "$1***").replace(/^(Bearer\s+).+/i, "$1***"));
      continue;
    }

    out.push(a);
  }
  return out;
}
