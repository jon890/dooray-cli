import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { DoorayCliError } from "../utils/errors.js";
import { EXIT_CONFIG_ERROR } from "../utils/exit-codes.js";
import type { Config } from "./types.js";
import { DEFAULTS } from "./types.js";

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
  await mkdir(DOORAY_DIR, { recursive: true });
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
      config.imapPort = parseInt(value, 10);
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
      config.smtpPort = parseInt(value, 10);
      break;
    case "track-last-run":
      config.trackLastRun = value === "true";
      break;
    default:
      throw new DoorayCliError(
        `알 수 없는 설정 키: ${key}\n사용 가능한 키: api-key, base-url, tenant-name, imap-host, imap-port, imap-username, imap-password, smtp-host, smtp-port, track-last-run`,
        EXIT_CONFIG_ERROR,
      );
  }

  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n");
}

export async function saveConfig(config: Config): Promise<void> {
  await ensureDir();
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n");
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
