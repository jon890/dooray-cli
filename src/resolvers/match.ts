import { DoorayCliError } from "../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../utils/exit-codes.js";

export interface NameRecord {
  name: string;
}

/**
 * 정확일치 → 부분일치(includes) → 모호시 에러 + 후보 목록.
 * 0개 매칭이면 not-found 에러.
 *
 * @param items 후보 목록
 * @param input 사용자 입력
 * @param label 에러 메시지에 들어갈 도메인 명 (예: "태그", "멤버")
 * @param renderCandidate 후보 한 줄 표현 (예: m => `${m.name} (${m.id})`)
 */
export function matchByName<T extends NameRecord>(
  items: T[],
  input: string,
  label: string,
  renderCandidate: (item: T) => string,
): T {
  const exact = items.filter((i) => i.name === input);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) {
    throw new DoorayCliError(
      `복수의 ${label}가 매칭됩니다(정확일치): "${input}"\n` +
        exact.map((i) => `  - ${renderCandidate(i)}`).join("\n"),
      EXIT_PARAM_ERROR,
    );
  }

  const partial = items.filter((i) => i.name.includes(input));
  if (partial.length === 1) return partial[0];
  if (partial.length > 1) {
    throw new DoorayCliError(
      `복수의 ${label}가 매칭됩니다: "${input}"\n` +
        partial.map((i) => `  - ${renderCandidate(i)}`).join("\n"),
      EXIT_PARAM_ERROR,
    );
  }

  throw new DoorayCliError(
    `${label}을(를) 찾을 수 없습니다: ${input}`,
    EXIT_PARAM_ERROR,
  );
}
