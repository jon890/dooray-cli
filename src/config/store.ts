import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { DoorayCliError } from "../utils/errors.js";
import { EXIT_CONFIG_ERROR } from "../utils/exit-codes.js";
import type { Config } from "./types.js";
import { DEFAULTS } from "./types.js";

const DOORAY_DIR = join(homedir(), ".dooray");
const CONFIG_PATH = join(DOORAY_DIR, "config.json");

async function ensureDir(): Promise<void> {
  await mkdir(DOORAY_DIR, { recursive: true });
}

export async function getConfig(): Promise<Config | null> {
  try {
    const raw = await readFile(CONFIG_PATH, "utf-8");
    return JSON.parse(raw) as Config;
  } catch {
    return null;
  }
}

export async function getConfigOrThrow(): Promise<Config> {
  const config = await getConfig();
  if (!config || !config.apiKey || !config.baseUrl) {
    throw new DoorayCliError(
      "설정이 완료되지 않았습니다. 먼저 초기 설정을 진행하세요:\n" +
        "  dooray setup",
      EXIT_CONFIG_ERROR,
    );
  }
  return config;
}

export async function setConfigValue(
  key: string,
  value: string,
): Promise<void> {
  await ensureDir();
  const config: Config = (await getConfig()) ?? {
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
