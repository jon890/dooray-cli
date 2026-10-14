import { readFile, writeFile, mkdir, rename, chmod, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { homedir } from "node:os";
import { DoorayCliError } from "../utils/errors.js";
import { EXIT_CONFIG_ERROR, EXIT_IO_ERROR, EXIT_PARAM_ERROR } from "../utils/exit-codes.js";
import type { Config } from "./types.js";
import { CONFIG_SET_KEYS, DEFAULTS } from "./types.js";
import type { SecretField, SecretStore } from "./secret-store.js";
import {
  assertStorableSecret,
  getSecretStore,
  isStorableSecret,
  SECRET_FIELDS,
} from "./secret-store.js";

const DOORAY_DIR = join(homedir(), ".dooray");
const CONFIG_PATH = join(DOORAY_DIR, "config.json");

export type ConfigReadResult =
  | { state: "ok"; config: Config }
  | { state: "absent" }
  | { state: "invalid"; reason: string }
  | { state: "unreadable"; reason: string; source?: "keychain" };

export type ClearMailResult =
  | { state: "cleared"; hadCredentials: boolean }
  | { state: "absent" }
  | { state: "failed"; reason: string };

/**
 * `~/.dooray` 를 소유자 전용으로 둔다.
 *
 * mkdir 의 mode 는 새로 만들 때만 적용되므로 이미 있던 디렉터리는 chmod 로 한 번 맞춘다.
 * chmod 는 Windows 처럼 POSIX 권한이 없는 곳에서 실패할 수 있어 저장을 막지 않는다.
 */
async function ensureDir(): Promise<void> {
  await mkdir(DOORAY_DIR, { recursive: true, mode: 0o700 });
  try {
    await chmod(DOORAY_DIR, 0o700);
  } catch {
    // POSIX 권한이 없는 파일 시스템이다. 저장은 계속한다.
  }
}

/** 키체인에 반영한 변경 하나다. 되돌릴 때 `previous` 로 맞춘다. 없었으면 `undefined` 다. */
interface AppliedSecretChange {
  field: SecretField;
  previous: string | undefined;
}

/**
 * config 를 저장한다. 비밀 저장소가 있으면 비밀 필드는 그쪽에 두고 파일에서는 뺀다 (ADR-069).
 *
 * 필드마다 지금 저장된 상태와 비교해 바뀐 것만 쓴다.
 * - 새 값이 비었거나 없으면 키체인에 있던 항목을 지운다. `clearMailCredentials` 가 이 경로로 imapPassword 를 지운다.
 * - 새 값이 키체인 값과 같으면 키체인을 건드리지 않는다.
 * - 그 밖에는 키체인에 쓴다. 파일에 있던 구버전 평문을 옮기는 경우도 여기에 든다.
 * 어느 경우든 키체인에 맡긴 필드는 파일에서 뺀다.
 *
 * 사용자가 새로 준 값이 키체인에 저장할 수 없는 문자를 담으면 어느 쪽에도 쓰기 전에 거절한다.
 * 파일에 있던 구버전 값이 그렇다면 거절하지 않고 그 필드만 파일에 남긴 채 경고한다.
 * 그 필드와 무관한 저장까지 막지 않기 위해서다.
 *
 * 키체인에 먼저 쓰고 파일을 쓴다. 뒤 단계가 실패하면 이번에 바꾼 키체인 항목을 이전 값으로 되돌린다.
 * 되돌리기는 best-effort 다. 그것마저 실패하면 원래 오류에 그 사실을 덧붙인다.
 */
async function writeConfig(config: Config): Promise<void> {
  const secrets = getSecretStore(CONFIG_PATH);
  if (!secrets) {
    await writeConfigFile(config);
    return;
  }

  const prior = await readConfigFile();
  const priorFile: StoredConfig | undefined =
    prior.state === "ok" ? prior.stored : undefined;

  const fileConfig: Partial<Config> = { ...config };
  const plan: { field: SecretField; value: string | undefined }[] = [];
  const keptInFile: SecretField[] = [];

  for (const field of SECRET_FIELDS) {
    const value = config[field] || undefined;
    delete fileConfig[field];
    const fileValue = nonEmpty(priorFile?.[field]);
    const migrating = value !== undefined && value === fileValue;

    if (value !== undefined && !isStorableSecret(value)) {
      if (!migrating) assertStorableSecret(field, value);
      // 구버전이 파일에 남긴 값이라 거절하지 않는다. 그대로 파일에 둔다.
      // 같은 필드의 키체인 항목은 지운다. 나중에 파일에서 그 필드를 지우면 낡은 값이 되살아나기 때문이다.
      fileConfig[field] = value;
      keptInFile.push(field);
      plan.push({ field, value: undefined });
      continue;
    }
    plan.push({ field, value });
  }

  const applied: AppliedSecretChange[] = [];
  try {
    for (const { field, value } of plan) {
      const current = await secrets.get(field);
      if (current === value) continue;
      if (value === undefined) await secrets.delete(field);
      else await secrets.set(field, value);
      applied.push({ field, previous: current });
    }
    await writeConfigFile(fileConfig);
  } catch (err) {
    throw await rollbackSecrets(secrets, applied, err);
  }

  for (const field of keptInFile) {
    process.stderr.write(
      `⚠  ${field} 값에 키체인에 저장할 수 없는 문자가 있어 키체인에 옮기지 못하고 config.json 에 남겨 둡니다.\n` +
        "   값을 바꾸면 그때 키체인으로 옮겨집니다.\n",
    );
  }
}

/**
 * 이번 저장에서 바꾼 키체인 항목을 이전 값으로 되돌리고, 던질 오류를 돌려준다.
 *
 * best-effort 다. 되돌리기도 실패하면 키체인 일부가 새 값으로 남을 수 있어 그 사실을 메시지에 덧붙인다.
 * 원래 오류의 종료 코드와 원인은 유지한다.
 */
async function rollbackSecrets(
  secrets: SecretStore,
  applied: AppliedSecretChange[],
  err: unknown,
): Promise<unknown> {
  const failed: SecretField[] = [];
  for (const { field, previous } of [...applied].reverse()) {
    try {
      if (previous === undefined) await secrets.delete(field);
      else await secrets.set(field, previous);
    } catch {
      failed.push(field);
    }
  }
  if (failed.length === 0) return err;
  const fields = failed.join(", ");
  return new DoorayCliError(
    `${reasonOf(err)}\n` +
      `키체인을 이전 값으로 되돌리지 못했습니다. 키체인 일부(${fields})가 새 값으로 남았을 수 있습니다.`,
    err instanceof DoorayCliError ? err.exitCode : EXIT_IO_ERROR,
    { cause: err },
  );
}

function nonEmpty(value: string | undefined): string | undefined {
  return value ? value : undefined;
}

/**
 * config.json 은 비밀 저장소가 없는 OS 에서 평문 apiKey 와 imapPassword 를 담으므로 소유자만 읽게 쓴다.
 *
 * `writeFile` 의 `mode` 는 파일을 새로 만들 때만 적용된다. 그래서 tmp 파일에 쓰고
 * rename 으로 교체한다. rename 은 대상 자리에 tmp 의 inode 를 두므로
 * 이미 0o644 로 있던 config.json 도 저장할 때 0o600 이 된다.
 *
 * tmp 이름에 pid 와 UUID 를 넣고 `wx` 로 열어, 동시에 저장하는 두 프로세스가
 * 같은 tmp 를 덮어쓰거나 남의 tmp 를 rename 하지 않게 한다.
 * 실패하면 tmp 를 지우고 파일 시스템 오류로 알린다.
 */
async function writeConfigFile(config: Partial<Config>): Promise<void> {
  const tmp = `${CONFIG_PATH}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(tmp, JSON.stringify(config, null, 2) + "\n", {
      mode: 0o600,
      flag: "wx",
    });
    await rename(tmp, CONFIG_PATH);
  } catch (err) {
    await unlink(tmp).catch(() => undefined);
    throw new DoorayCliError(
      `설정 파일을 저장하지 못했습니다: ${CONFIG_PATH}\n이유: ${reasonOf(err)}`,
      EXIT_IO_ERROR,
      { cause: err },
    );
  }
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

/**
 * `apiKeyOptional` 은 config.json 을 읽을 때 OS 와 무관하게 켠다 (ADR-069).
 * macOS 에서 키체인으로 옮긴 파일에는 `apiKey` 가 없고, 그 파일이 다른 OS 로 동기화될 수도 있다.
 * 없으면 `getConfig` 가 빈 문자열로 채워 「설정 미완료」 로 안내한다. 문자열이 아닌 값은 여전히 손상이다.
 * `isConfig` 는 `Config` 타입 가드라 `apiKey` 를 요구한다.
 */
function invalidConfigReason(
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

/** config.json 에 적힌 그대로의 형태다. `apiKey` 가 없을 수 있다. */
type StoredConfig = Omit<Config, "apiKey"> & { apiKey?: string };

function isStoredConfig(value: unknown): value is StoredConfig {
  return invalidConfigReason(value, { apiKeyOptional: true }) === null;
}

export function configReadErrorMessage(
  result: Extract<ConfigReadResult, { state: "invalid" | "unreadable" }>,
): string {
  if (result.state === "invalid") {
    return (
      `설정 파일이 손상되었습니다: ${CONFIG_PATH}\n` +
      `이유: ${result.reason}`
    );
  }
  if (result.source === "keychain") {
    return `설정의 비밀값을 읽지 못했습니다.\n${result.reason}`;
  }
  return (
    `설정 파일을 읽지 못했습니다: ${CONFIG_PATH}\n` +
    `이유: ${result.reason}\n` +
    "파일 권한을 확인하세요."
  );
}

type ConfigFileReadResult =
  | { state: "ok"; stored: StoredConfig }
  | Exclude<ConfigReadResult, { state: "ok" }>;

/** config.json 을 읽고 검증한다. `apiKey` 가 없어도 통과시킨다. */
async function readConfigFile(): Promise<ConfigFileReadResult> {
  let parsed: unknown;
  try {
    const raw = await readFile(CONFIG_PATH, "utf-8");
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      return { state: "invalid", reason: reasonOf(err) };
    }
  } catch (err) {
    if (isNodeError(err) && err.code === "ENOENT") return { state: "absent" };
    return { state: "unreadable", reason: reasonOf(err) };
  }

  if (!isStoredConfig(parsed)) {
    const invalidReason =
      invalidConfigReason(parsed, { apiKeyOptional: true }) ??
      "설정 파일 형식이 올바르지 않습니다.";
    return { state: "invalid", reason: invalidReason };
  }
  return { state: "ok", stored: parsed };
}

/**
 * 비밀 필드를 필드마다 채운다 (ADR-069).
 *
 * 파일에 비어 있지 않은 값이 있으면 그 값을 쓰고 키체인은 읽지 않는다.
 * 새 CLI 는 저장할 때마다 파일에서 비밀 필드를 빼므로, 파일에 남은 평문은
 * 아직 옮기지 않은 구버전 값이거나 다운그레이드한 구버전 CLI 가 나중에 쓴 값이다. 둘 다 파일이 맞다.
 * 파일에 없거나 빈 문자열일 때만 키체인을 읽는다. 읽기만으로는 파일을 고치지 않는다.
 */
async function fillSecrets(
  stored: StoredConfig,
  secrets: SecretStore,
): Promise<ConfigReadResult> {
  const merged: Config = { ...stored, apiKey: stored.apiKey ?? "" };
  try {
    for (const field of SECRET_FIELDS) {
      if (nonEmpty(stored[field]) !== undefined) continue;
      const value = await secrets.get(field);
      if (value !== undefined) merged[field] = value;
    }
  } catch (err) {
    return { state: "unreadable", reason: reasonOf(err), source: "keychain" };
  }
  return { state: "ok", config: merged };
}

/**
 * 키체인에 접근하지 못하면 `unreadable` 로 돌려준다 (ADR-069).
 * 설정은 있는데 지금 읽을 수 없는 상태라는 뜻이 파일 권한 오류와 같다.
 */
export async function getConfig(): Promise<ConfigReadResult> {
  const file = await readConfigFile();
  if (file.state !== "ok") return file;
  const secrets = getSecretStore(CONFIG_PATH);
  // apiKey 가 어디에도 없으면 빈 문자열로 채운다. getConfigOrThrow 가 그것을 「설정 미완료」 로 본다.
  if (!secrets) {
    return {
      state: "ok",
      config: { ...file.stored, apiKey: file.stored.apiKey ?? "" },
    };
  }
  return fillSecrets(file.stored, secrets);
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

  await writeConfig(config);
}

export async function saveConfig(config: Config): Promise<void> {
  await ensureDir();
  await writeConfig(config);
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
