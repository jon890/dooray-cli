/** 웹 리액션 명령이 받는 이모지 이름의 형식을 검사한다. */
import { DoorayCliError } from "./errors.js";
import { EXIT_PARAM_ERROR } from "./exit-codes.js";

const NAME_PATTERN = /^[a-z0-9_+-]+$/i;

export function normalizeReactionName(raw: string): string {
  const name = raw.trim().replace(/^:(.+):$/, "$1");
  if (!NAME_PATTERN.test(name)) {
    throw new DoorayCliError(
      `리액션은 이모지 문자가 아니라 이름으로 줍니다(예: --emoji +1). 받은 값: ${JSON.stringify(raw)}`,
      EXIT_PARAM_ERROR,
    );
  }
  return name;
}
