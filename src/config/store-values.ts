/** 설정값 검증과 비밀값을 숨기는 오류 이유 작성. */
import type { Config } from "@/config/types.js";
import type { StoredConfig } from "@/config/store-types.js";
import { DoorayCliError } from "@/utils/errors.js";
import { EXIT_PARAM_ERROR } from "@/utils/exit-codes.js";

export function nonEmpty(value: string | undefined): string | undefined {
  return value ? value : undefined;
}

/** 포트 값은 1~65535 정수만 받는다. NaN 이 저장되면 JSON 에서 null 이 되어 설정 전체가 손상 판정을 받는다. */
export function parsePort(key: string, value: string): number {
  const trimmed = value.trim();
  const port = /^\d+$/.test(trimmed) ? Number(trimmed) : NaN;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new DoorayCliError(
      `${key} 값이 올바르지 않습니다: ${value}\n1 에서 65535 사이의 정수를 입력하세요.`,
      EXIT_PARAM_ERROR,
    );
  }
  return port;
}

const TRUE_VALUES = new Set(["true", "yes", "1"]);

const FALSE_VALUES = new Set(["false", "no", "0"]);

/** 불리언 값은 명확한 값만 받는다. 오타가 조용히 false 로 저장되지 않게 한다. */
export function parseBoolean(key: string, value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  throw new DoorayCliError(
    `${key} 값이 올바르지 않습니다: ${value}\n사용 가능한 값: true, false, yes, no, 1, 0`,
    EXIT_PARAM_ERROR,
  );
}

export function reasonOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * JSON 파싱 실패의 reason. Node 의 오류 메시지는 원문 앞뒤를 발췌해 따옴표 없는 비밀값이
 * 그대로 실리므로(`Unexpected token 'S', ..."{"apiKey":SECRETTOKE"...`) 메시지를 쓰지 않고
 * 위치만 남긴다. 위치를 구하지 못하면 위치 없이 낸다.
 */
export function jsonParseReason(raw: string, err: unknown): string {
  const base = "JSON 형식이 아닙니다";
  const offset = errorOffset(raw, err instanceof Error ? err.message : "");
  if (offset === undefined) return base;
  const before = raw.slice(0, offset).split("\n");
  return `${base}(${before.length}번째 줄 ${before[before.length - 1].length + 1}번째 글자 근처)`;
}

function errorOffset(raw: string, message: string): number | undefined {
  const located = /\(line (\d+) column (\d+)\)/.exec(message);
  if (located) {
    const lines = raw.split("\n");
    const line = Number(located[1]);
    if (line < 1 || line > lines.length) return undefined;
    return (
      lines.slice(0, line - 1).reduce((sum, l) => sum + l.length + 1, 0) +
      Number(located[2]) - 1
    );
  }
  const at = /in JSON at position (\d+)/.exec(message);
  if (at) return Number(at[1]) <= raw.length ? Number(at[1]) : undefined;
  if (/^Unexpected end of JSON input/.test(message)) {
    return raw.length === 0 ? undefined : raw.length;
  }
  // Node 24 는 위치 대신 원문 발췌를 준다. 발췌를 원문에서 찾아 위치만 구한다.
  const excerpt = /^Unexpected token '([\s\S])', (\.\.\.)?"([\s\S]*)"(\.\.\.)? is not valid JSON$/.exec(message);
  if (!excerpt) return undefined;
  const [, token, leading, snippet, trailing] = excerpt;
  // 발췌는 오류 위치 앞뒤 10자다. 앞뒤 어느 쪽도 잘리지 않았으면 위치가 모호해 생략한다.
  let offset: number;
  if (leading) {
    const start = raw.indexOf(snippet);
    if (start < 0) return undefined;
    offset = start + 10;
  } else if (trailing) {
    offset = snippet.length - 10;
  } else {
    return undefined;
  }
  return raw[offset] === token ? offset : undefined;
}

export function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}

/**
 * `apiKeyOptional` 은 config.json 을 읽을 때 OS 와 무관하게 켠다 (ADR-069).
 * macOS 에서 키체인으로 옮긴 파일에는 `apiKey` 가 없고, 그 파일이 다른 OS 로 동기화될 수도 있다.
 * 없으면 `getConfig` 가 빈 문자열로 채워 「설정 미완료」 로 안내한다. 문자열이 아닌 값은 여전히 손상이다.
 * `isConfig` 는 `Config` 타입 가드라 `apiKey` 를 요구한다.
 */
export function invalidConfigReason(
  value: unknown,
  { apiKeyOptional = false }: { apiKeyOptional?: boolean } = {},
): string | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return "설정 파일은 객체여야 합니다.";
  }

  const config = value as Record<string, unknown>;
  if (config.version !== 1) return "version 필드는 1이어야 합니다.";
  const apiKeyMissingAllowed = apiKeyOptional && config.apiKey === undefined;
  if (typeof config.apiKey !== "string" && !apiKeyMissingAllowed) {
    return "apiKey 필드는 문자열이어야 합니다.";
  }
  if (typeof config.baseUrl !== "string") {
    return "baseUrl 필드는 문자열이어야 합니다.";
  }

  const optionalStringFields = [
    "sessionCookie",
    "tenantName",
    "imapHost",
    "imapUsername",
    "imapPassword",
    "smtpHost",
  ];
  for (const field of optionalStringFields) {
    if (config[field] !== undefined && typeof config[field] !== "string") {
      return `${field} 필드는 문자열이어야 합니다.`;
    }
  }

  if (config.authMode !== undefined && config.authMode !== "api-key" && config.authMode !== "web") {
    return "authMode 필드는 api-key 또는 web 이어야 합니다.";
  }

  for (const field of ["imapPort", "smtpPort"]) {
    if (config[field] !== undefined && typeof config[field] !== "number") {
      return `${field} 필드는 숫자여야 합니다.`;
    }
  }

  if (
    config.trackLastRun !== undefined &&
    typeof config.trackLastRun !== "boolean"
  ) {
    return "trackLastRun 필드는 boolean이어야 합니다.";
  }

  return null;
}

export function isConfig(value: unknown): value is Config {
  return invalidConfigReason(value) === null;
}

export function isStoredConfig(value: unknown): value is StoredConfig {
  return invalidConfigReason(value, { apiKeyOptional: true }) === null;
}
