/** 설정 키 갱신, 전체 저장과 메일 인증 정보 삭제. */
import type { Config } from "@/config/types.js";
import { CONFIG_SET_KEYS, DEFAULTS } from "@/config/types.js";
import type { ClearMailResult } from "@/config/store-types.js";
import { ensureDir } from "@/config/store-file.js";
import { parseBoolean, parsePort } from "@/config/store-values.js";
import { configReadErrorMessage, getConfig } from "@/config/store-read.js";
import { writeConfig } from "@/config/store-secrets.js";
import { parseSessionCookie, resolveWebBaseUrl } from "@/config/web-auth.js";
import { DoorayCliError } from "@/utils/errors.js";
import { EXIT_CONFIG_ERROR, EXIT_PARAM_ERROR } from "@/utils/exit-codes.js";

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
    case "auth-mode":
      if (value !== "api-key" && value !== "web") throw new DoorayCliError("auth-mode 는 api-key 또는 web 이어야 합니다.", EXIT_PARAM_ERROR);
      if (value === "web") {
        try { resolveWebBaseUrl(config); }
        catch { throw new DoorayCliError("웹 방식으로 바꾸려면 tenant-name·base-url 을 먼저 설정하세요.", EXIT_PARAM_ERROR); }
      }
      config.authMode = value;
      break;
    case "session-cookie":
      config.sessionCookie = parseSessionCookie(value);
      break;
    case "api-key":
      config.apiKey = value;
      break;
    case "base-url":
      if (config.authMode === "web") {
        try { resolveWebBaseUrl({ ...config, baseUrl: value }); }
        catch { throw new DoorayCliError("웹 방식의 base-url 은 알려진 클라우드의 https 주소여야 합니다.", EXIT_PARAM_ERROR); }
      }
      config.baseUrl = config.authMode === "web" ? value.replace(/\/+$/, "") : value;
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
      if (config.authMode === "web") {
        try { resolveWebBaseUrl({ ...config, tenantName: value }); }
        catch { throw new DoorayCliError("웹 방식의 tenant-name 을 확인하세요. 영문 소문자·숫자·- 만 쓸 수 있습니다.", EXIT_PARAM_ERROR); }
      }
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
