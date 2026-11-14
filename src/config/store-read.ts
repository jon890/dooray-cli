/** 설정과 비밀값 읽기, 인증 방식 조회와 필수 설정 확인. */
import type { Config } from "@/config/types.js";
import type { ConfigReadResult, StoredConfig } from "@/config/store-types.js";
import { CONFIG_PATH, readConfigFile } from "@/config/store-file.js";
import { nonEmpty, reasonOf } from "@/config/store-values.js";
import { getSecretStore, SECRET_FIELDS, type SecretStore } from "@/config/secret-store.js";
import { isConfigComplete } from "@/config/web-auth.js";
import { warnConfigFileSecurity } from "@/config/store-security.js";
import { DoorayCliError } from "@/utils/errors.js";
import { EXIT_CONFIG_ERROR } from "@/utils/exit-codes.js";

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
      if (field === "sessionCookie" && stored.authMode !== "web") continue;
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

/** 명령 지원 판정용으로 파일만 읽는다. 키체인·보안 경고를 건드리지 않는다. */
export async function readAuthModeFromFile(): Promise<"api-key" | "web"> {
  const file = await readConfigFile();
  if (file.state === "invalid" || file.state === "unreadable") throw new DoorayCliError(configReadErrorMessage(file), EXIT_CONFIG_ERROR);
  return file.state === "ok" ? file.stored.authMode ?? "api-key" : "api-key";
}

/** config get 의 명시 조회는 API 방식에서도 저장한 쿠키의 유무를 확인한다. */
export async function readSessionCookie(): Promise<string | undefined> {
  const file = await readConfigFile();
  if (file.state === "invalid" || file.state === "unreadable") throw new DoorayCliError(configReadErrorMessage(file), EXIT_CONFIG_ERROR);
  if (file.state !== "ok") return undefined;
  if (nonEmpty(file.stored.sessionCookie)) return file.stored.sessionCookie;
  return getSecretStore(CONFIG_PATH)?.get("sessionCookie");
}

export async function getConfigOrThrow(
  { securityWarning = true }: { securityWarning?: boolean } = {},
): Promise<Config> {
  const result = await getConfig();
  if (result.state === "ok" && securityWarning) await warnConfigFileSecurity();
  if (result.state === "invalid" || result.state === "unreadable") {
    throw new DoorayCliError(configReadErrorMessage(result), EXIT_CONFIG_ERROR);
  }
  const missing = result.state === "ok" ? isConfigComplete(result.config) : ["config"];
  if (result.state === "absent" || missing.length) {
    throw new DoorayCliError(
      `설정이 완료되지 않았습니다 (${missing.join(", ")}). 먼저 초기 설정을 진행하세요:\n` +
        "  dooray setup",
      EXIT_CONFIG_ERROR,
    );
  }
  return result.config;
}
