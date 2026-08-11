import { readStdin } from "./body-input.js";
import { DoorayCliError } from "./errors.js";
import { EXIT_PARAM_ERROR } from "./exit-codes.js";

/**
 * `config set <key> <value>` 의 값을 확정한다.
 *
 * - 값이 `"-"` 이면 stdin 에서 읽는다 (`--body -` 와 같은 규약).
 * - stdin 으로 받은 값은 양끝 공백을 제거한다. 파이프는 대개 줄바꿈을 덧붙이는데,
 *   API 토큰에 줄바꿈이 섞이면 인증이 조용히 실패한다.
 * - 비면 저장하지 않고 에러를 낸다. 빈 값을 저장하면 설정 파일은 있는데
 *   값이 없는 상태가 되어 진단이 어려워진다.
 *
 * 토큰 같은 값을 명령 인자로 넘기면 셸 기록과 프로세스 목록에 남는다.
 * stdin 경로는 그 노출을 피하려는 것이다.
 */
export async function resolveConfigValue(
  raw: string,
  read: () => Promise<string> = readStdin,
): Promise<string> {
  if (raw !== "-") return raw;

  const value = (await read()).trim();
  if (value === "") {
    throw new DoorayCliError(
      "stdin 으로 받은 값이 비어 있습니다.",
      EXIT_PARAM_ERROR,
    );
  }
  return value;
}
