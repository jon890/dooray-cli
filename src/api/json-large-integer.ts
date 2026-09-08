/**
 * 응답 JSON 의 정수 리터럴 중 Number 로 담으면 값이 달라지는 것만 문자열로 감싸 파싱한다.
 *
 * Dooray 의 식별자는 19자리 정수라 `Number.MAX_SAFE_INTEGER`(16자리, 9007199254740991)를 넘는다.
 * `JSON.parse` 가 그런 리터럴을 그대로 Number 로 읽으면 뒷자리가 달라진다.
 *
 * ```
 * 원본 텍스트   {"id": 1234567890123456789}
 * JSON.parse   1234567890123456800
 * ```
 *
 * `JSON.parse` 의 reviver 로는 고칠 수 없다. reviver 는 이미 Number 로 바뀐 값을 받아
 * 원본 자릿수가 남아 있지 않다. 그래서 파싱 전에 텍스트를 훑어 해당 리터럴을 따옴표로 감싼다.
 *
 * 자릿수로 자르지 않고 값으로 판정한다. 정수 리터럴을 Number 로 읽고 다시 문자열로 만들어
 * 원본과 다를 때만 감싼다. 안전 범위 안의 값은 그대로 두어 기존 동작을 유지한다.
 *
 * 자세한 배경은 docs/adr/051-json-large-integer-precision.md 를 참고한다.
 */

// JSON 숫자 문법의 정수부다. 선행 0 과 숫자 없는 부호는 JSON 에서 불법이므로 감싸지 않는다.
// 감싸면 잘못된 응답이 유효한 값으로 파싱돼 오류가 드러나지 않는다.
const JSON_INTEGER = /^-?(?:0|[1-9]\d*)$/;

function isDigit(ch: string | undefined): boolean {
  return ch !== undefined && ch >= "0" && ch <= "9";
}

/**
 * 이 정수 리터럴을 Number 로 담으면 값이 달라지는지 본다.
 *
 * 문자열끼리 비교하면 `-0` 처럼 표기만 다르고 값은 같은 것을 손실로 잘못 본다.
 * `BigInt` 로 값끼리 비교해 표기 차이를 판정에서 뺀다.
 */
function losesPrecision(literal: string): boolean {
  const asNumber = Number(literal);
  if (!Number.isInteger(asNumber)) return true;
  return BigInt(literal) !== BigInt(asNumber);
}

/**
 * JSON 텍스트를 훑어, 값으로 손실이 나는 정수 리터럴만 따옴표로 감싼 텍스트를 만든다.
 * 문자열 리터럴 구간은 그대로 통과시켜 본문 안의 숫자는 건드리지 않는다.
 */
function quoteLossyIntegers(text: string): string {
  let result = "";
  let i = 0;
  const n = text.length;

  while (i < n) {
    const ch = text[i];

    if (ch === '"') {
      const start = i;
      i++;
      while (i < n) {
        if (text[i] === "\\") {
          i += 2;
          continue;
        }
        if (text[i] === '"') {
          i++;
          break;
        }
        i++;
      }
      result += text.slice(start, i);
      continue;
    }

    if (ch === "-" || isDigit(ch)) {
      const start = i;
      if (ch === "-") i++;
      while (isDigit(text[i])) i++;

      let isInteger = true;

      if (text[i] === ".") {
        isInteger = false;
        i++;
        while (isDigit(text[i])) i++;
      }

      if (text[i] === "e" || text[i] === "E") {
        isInteger = false;
        i++;
        if (text[i] === "+" || text[i] === "-") i++;
        while (isDigit(text[i])) i++;
      }

      const literal = text.slice(start, i);
      if (isInteger && JSON_INTEGER.test(literal) && losesPrecision(literal)) {
        result += `"${literal}"`;
      } else {
        result += literal;
      }
      continue;
    }

    result += ch;
    i++;
  }

  return result;
}

/**
 * JSON 텍스트를 파싱하되, Number 로 담으면 값이 달라지는 정수 리터럴만 문자열로 보존한다.
 * 잘못된 JSON 이 들어오면 `JSON.parse` 가 던지는 오류를 그대로 올린다.
 */
export function parseJsonPreservingLargeIntegers(text: string): unknown {
  return JSON.parse(quoteLossyIntegers(text));
}
