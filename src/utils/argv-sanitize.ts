/**
 * argv에서 시크릿 패턴을 자동 마스킹.
 * ADR-023 sanitization 룰 표 기준.
 */

import { isSecretConfigKey } from "../config/types.js";

const KEY_VALUE_PATTERNS = [
  /^(--api-key|--token|--password)=(.+)$/,
];
const SEPARATED_KEYS = new Set(["--api-key", "--token", "--password"]);

/**
 * `config set <key> <value>` 에서 key 가 비밀값이면 value 의 위치를 돌려준다.
 * `-` 는 stdin 에서 읽으라는 표시라 값이 아니므로 가리지 않는다.
 */
function secretConfigValueIndexes(argv: string[]): Set<number> {
  const indexes = new Set<number>();
  for (let i = 0; i + 3 < argv.length; i++) {
    if (argv[i] !== "config" || argv[i + 1] !== "set") continue;
    if (isSecretConfigKey(argv[i + 2]) && argv[i + 3] !== "-") indexes.add(i + 3);
  }
  return indexes;
}

export function sanitizeArgv(argv: string[]): string[] {
  const out: string[] = [];
  const secretValues = secretConfigValueIndexes(argv);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];

    if (secretValues.has(i)) {
      out.push("***");
      continue;
    }

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
