import { readFile, writeFile, mkdir, rename, chmod } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { DoorayCliError } from "../utils/errors.js";
import { EXIT_CONFIG_ERROR, EXIT_PARAM_ERROR } from "../utils/exit-codes.js";
import type { Config } from "./types.js";
import { CONFIG_SET_KEYS, DEFAULTS } from "./types.js";

const DOORAY_DIR = join(homedir(), ".dooray");
const CONFIG_PATH = join(DOORAY_DIR, "config.json");

export type ConfigReadResult =
  | { state: "ok"; config: Config }
  | { state: "absent" }
  | { state: "invalid"; reason: string }
  | { state: "unreadable"; reason: string };

export type ClearMailResult =
  | { state: "cleared"; hadCredentials: boolean }
  | { state: "absent" }
  | { state: "failed"; reason: string };

async function ensureDir(): Promise<void> {
  await mkdir(DOORAY_DIR, { recursive: true, mode: 0o700 });
}

/**
 * config.json 은 평문 apiKey 와 imapPassword 를 담으므로 소유자만 읽게 쓴다.
 *
 * `writeFile` 의 `mode` 는 파일을 새로 만들 때만 적용된다. 그래서 tmp 파일에 쓰고
 * rename 으로 교체한다. rename 은 대상 자리에 tmp 의 inode 를 두므로
 * 이미 0o644 로 있던 config.json 도 저장할 때 0o600 이 된다.
 * 이전 실행이 남긴 tmp 가 있으면 mode 가 적용되지 않으니 chmod 로 한 번 더 맞춘다.
 * chmod 는 Windows 처럼 POSIX 권한이 없는 곳에서 실패할 수 있어 저장을 막지 않는다.
 */
async function writeConfigFile(config: Config): Promise<void> {
  const tmp = CONFIG_PATH + ".tmp";
  await writeFile(tmp, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
  try {
    await chmod(tmp, 0o600);
  } catch {
    // POSIX 권한이 없는 파일 시스템이다. 저장은 계속한다.
  }
  await rename(tmp, CONFIG_PATH);
}

/** 포트 값은 1~65535 정수만 받는다. NaN 이 저장되면 JSON 에서 null 이 되어 설정 전체가 손상 판정을 받는다. */
function parsePort(key: string, value: string): number {
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
function parseBoolean(key: string, value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  throw new DoorayCliError(
    `${key} 값이 올바르지 않습니다: ${value}\n사용 가능한 값: true, false, yes, no, 1, 0`,
    EXIT_PARAM_ERROR,
  );
}

function reasonOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}

function invalidConfigReason(value: unknown): string | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return "설정 파일은 객체여야 합니다.";
  }

  const config = value as Record<string, unknown>;
  if (config.version !== 1) return "version 필드는 1이어야 합니다.";
  if (typeof config.apiKey !== "string") {
    return "apiKey 필드는 문자열이어야 합니다.";
  }
  if (typeof config.baseUrl !== "string") {
    return "baseUrl 필드는 문자열이어야 합니다.";
  }

  const optionalStringFields = [
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

function configReadErrorMessage(
  result: Extract<ConfigReadResult, { state: "invalid" | "unreadable" }>,
): string {
  if (result.state === "invalid") {
    return (
      `설정 파일이 손상되었습니다: ${CONFIG_PATH}\n` +
      `이유: ${result.reason}`
    );
  }
  return (
    `설정 파일을 읽지 못했습니다: ${CONFIG_PATH}\n` +
    `이유: ${result.reason}\n` +
    "파일 권한을 확인하세요."
  );
}

export async function getConfig(): Promise<ConfigReadResult> {
  try {
    const raw = await readFile(CONFIG_PATH, "utf-8");
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!isConfig(parsed)) {
        const invalidReason =
          invalidConfigReason(parsed) ?? "설정 파일 형식이 올바르지 않습니다.";
        return { state: "invalid", reason: invalidReason };
      }
      return { state: "ok", config: parsed };
    } catch (err) {
      return { state: "invalid", reason: reasonOf(err) };
    }
  } catch (err) {
    if (isNodeError(err) && err.code === "ENOENT") return { state: "absent" };
    return { state: "unreadable", reason: reasonOf(err) };
  }
}

export async function getConfigOrThrow(): Promise<Config> {
  const result = await getConfig();
  if (result.state === "invalid" || result.state === "unreadable") {
    throw new DoorayCliError(configReadErrorMessage(result), EXIT_CONFIG_ERROR);
  }
  if (
    result.state === "absent" ||
    !result.config.apiKey ||
    !result.config.baseUrl
  ) {
    throw new DoorayCliError(
      "설정이 완료되지 않았습니다. 먼저 초기 설정을 진행하세요:\n" +
        "  dooray setup",
      EXIT_CONFIG_ERROR,
    );
  }
  return result.config;
}

export async function setConfigValue(
  key: string,
  value: string,
): Promise<void> {
  await ensureDir();
  const result = await getConfig();
  if (result.state === "invalid" || result.state === "unreadable") {
    throw new DoorayCliError(configReadErrorMessage(result), EXIT_CONFIG_ERROR);
  }
  const config: Config =
    result.state === "ok"
      ? result.config
      : {
          version: 1,
          apiKey: "",
          baseUrl: DEFAULTS.baseUrl,
        };

  switch (key) {
    case "api-key":
      config.apiKey = value;
      break;
    case "base-url":
      config.baseUrl = value;
      break;
    case "imap-host":
      config.imapHost = value;
      break;
    case "imap-port":
      config.imapPort = parsePort(key, value);
      break;
    case "imap-username":
      config.imapUsername = value;
      break;
    case "imap-password":
      config.imapPassword = value;
      break;
    case "smtp-host":
      config.smtpHost = value;
      break;
    case "tenant-name":
      config.tenantName = value;
      break;
    case "smtp-port":
      config.smtpPort = parsePort(key, value);
      break;
    case "track-last-run":
      config.trackLastRun = parseBoolean(key, value);
      break;
    default:
      throw new DoorayCliError(
        `알 수 없는 설정 키: ${key}\n사용 가능한 키: ${CONFIG_SET_KEYS.join(", ")}`,
        EXIT_CONFIG_ERROR,
      );
  }

  await writeConfigFile(config);
}

export async function saveConfig(config: Config): Promise<void> {
  await ensureDir();
  await writeConfigFile(config);
}

export function removeMailCredentials(config: Config): Config {
  const next = { ...config };
  delete next.imapUsername;
  delete next.imapPassword;
  return next;
}

export async function clearMailCredentials(): Promise<ClearMailResult> {
  const result = await getConfig();
  if (result.state === "absent") return { state: "absent" };
  if (result.state === "invalid" || result.state === "unreadable") {
    return { state: "failed", reason: configReadErrorMessage(result) };
  }
  const hadCredentials = !!(
    result.config.imapUsername || result.config.imapPassword
  );
  await saveConfig(removeMailCredentials(result.config));
  return { state: "cleared", hadCredentials };
}
