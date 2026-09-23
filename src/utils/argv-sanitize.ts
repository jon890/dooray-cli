/**
 * argv에서 시크릿 패턴을 자동 마스킹.
 * ADR-023 sanitization 룰 표 기준.
 */

const KEY_VALUE_PATTERNS = [
  /^(--api-key|--token|--password)=(.+)$/,
];
const SEPARATED_KEYS = new Set(["--api-key", "--token", "--password"]);

/**
 * `config set <key> <value>` 의 value 위치를 돌려준다.
 *
 * 키 종류와 관계없이 가린다. `config set apikey <토큰>` 처럼 키를 틀리면 명령이 실패해
 * 직전 실행 기록에 남는데, 그때도 토큰이 드러나면 안 되기 때문이다.
 * key 다음의 첫 위치 인자가 value 다. 옵션(`-` 로 시작)과 `--` 는 건너뛰고,
 * `--` 뒤의 토큰은 옵션처럼 보여도 위치 인자다.
 * `-` 는 stdin 에서 읽으라는 표시라 값이 아니므로 가리지 않는다.
 */
function configSetValueIndexes(argv: string[]): Set<number> {
  const indexes = new Set<number>();
  for (let i = 0; i + 1 < argv.length; i++) {
    if (argv[i] !== "config" || argv[i + 1] !== "set") continue;
    let positional = 0;
    let afterDoubleDash = false;
    for (let j = i + 2; j < argv.length; j++) {
      const a = argv[j];
      if (!afterDoubleDash && a === "--") {
        afterDoubleDash = true;
        continue;
      }
      if (!afterDoubleDash && a.startsWith("-") && a !== "-") continue;
      positional++;
      if (positional === 2) {
        if (a !== "-") indexes.add(j);
        break;
      }
    }
  }
  return indexes;
}

export function sanitizeArgv(argv: string[]): string[] {
  const out: string[] = [];
  const configValues = configSetValueIndexes(argv);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];

    if (configValues.has(i)) {
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
