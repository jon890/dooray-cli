/**
 * 입력 오류 안내에 넣는 "완성 명령" 을 만드는 순수 함수들.
 * ADR-044 — 옵션을 다시 조립하지 않고 실행된 argv 를 그대로 옮긴다.
 */

/** 인용부호 없이 셸에 그대로 넘겨도 안전한 토큰 */
const SHELL_SAFE = /^[A-Za-z0-9._/:@=-]+$/;

/**
 * 셸에 붙여 그대로 실행할 수 있게 토큰을 인용한다.
 * 안전한 문자만으로 된 토큰은 그대로 두고, 그 밖은 단일 인용부호로 감싼다.
 */
export function shellQuote(token: string): string {
  if (SHELL_SAFE.test(token)) return token;
  return `'${token.replace(/'/g, "'\\''")}'`;
}

/**
 * 실행된 argv 에서 positional 을 빼고 `--id <postId>` 를 붙인 명령 한 줄을 만든다.
 *
 * - `--` 로 시작하는 토큰은 유지한다. 다음 토큰이 `positionals` 에 없고 옵션도 아닐 때만
 *   그것을 값으로 보고 함께 유지한다 (`--body-file 337` 처럼 값이 업무 번호와 같을 수 있다).
 *   다음 토큰이 `positionals` 에 있으면 값이 아니므로 한 칸만 건너뛴다
 *   (`--dry-run`, `--yes`, `--json`, `--quiet` 처럼 값을 받지 않는 flag 가 positional 앞에 온다).
 * - `--opt=value` 는 한 토큰이라 다음 토큰을 건너뛰지 않는다.
 * - 옵션이 아닌 토큰은 `positionals` 와 비교해 일치하면 빼고, 같은 값이 두 번 와도 한 번만 빼낸다.
 *   일치하지 않는 토큰은 남는다 — 하위 명령 이름이 이 경로로 살아남는다.
 */
export function buildIdModeCommand(
  argv: string[],
  positionals: string[],
  postId: string,
): string {
  const pending = [...positionals];
  const kept: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];

    if (token.startsWith("--")) {
      kept.push(token);
      if (token.includes("=")) continue;
      const next = argv[i + 1];
      if (next === undefined) continue;
      // 다음이 옵션이면 값이 아니다. positional 이면 값으로 보지 않는다.
      if (next.startsWith("--") || pending.includes(next)) continue;
      kept.push(next);
      i++;
      continue;
    }

    const at = pending.indexOf(token);
    if (at >= 0) {
      pending.splice(at, 1);
      continue;
    }
    kept.push(token);
  }

  kept.push("--id", postId);
  return `dooray ${kept.map(shellQuote).join(" ")}`;
}
