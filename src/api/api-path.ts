import { DoorayCliError } from "../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../utils/exit-codes.js";

/**
 * API 경로를 만드는 tagged template (ADR-075).
 *
 * 끼워 넣는 값은 모두 `encodeURIComponent` 를 거친다. `/`·`?`·`#` 가 섞인 id 가 다른 경로를 부르거나
 * 쿼리와 fragment 로 읽히지 않게 하고, 인증 헤더가 의도하지 않은 경로로 가는 것을 막는다.
 * 숫자 id 는 인코딩해도 그대로라 정상 호출의 요청은 달라지지 않는다.
 *
 * 값이 `""`, `.`, `..` 이면 `DoorayCliError`(`EXIT_PARAM_ERROR`)를 던진다. `encodeURIComponent` 는 `.` 를 그대로 두고,
 * WHATWG URL 파서는 `%2e%2e` 도 dot segment 로 보고 정규화한다. 그래서 escape 로는 막을 수 없고, `getPost("..", "1")` 이
 * `project/v1/posts/1` 을 부르는 일을 거부로만 막는다. `a..b` 처럼 `..` 가 섞였을 뿐인 값은 segment 가 아니라 통과한다.
 *
 * 주소 앞부분(`baseUrl`)과 쿼리 문자열 전체, 이미 인코딩된 값은 이 helper 에 끼우지 않는다.
 */
export function apiPath(strings: TemplateStringsArray, ...values: Array<string | number>): string {
  let out = strings[0] ?? "";
  values.forEach((value, i) => {
    const text = String(value);
    if (text === "" || text === "." || text === "..") {
      throw new DoorayCliError(
        `API 경로에 넣을 수 없는 값입니다: ${JSON.stringify(text)} (빈 값, ".", ".." 는 URL 정규화로 다른 경로를 부릅니다)`,
        EXIT_PARAM_ERROR,
      );
    }
    out += encodeURIComponent(value) + (strings[i + 1] ?? "");
  });
  return out;
}
