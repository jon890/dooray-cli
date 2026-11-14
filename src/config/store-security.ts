/** 설정 파일 권한·평문 검사와 프로세스마다 한 번만 내는 경고 (ADR-080). */
import { stat } from "node:fs/promises";
import { CONFIG_PATH, readConfigFile } from "@/config/store-file.js";
import { getSecretStore } from "@/config/secret-store.js";
import { assessConfigFileSecurity, getConfigFileSecurityFixAdvice, type ConfigFileSecurityFinding } from "@/config/file-security.js";

/** 설정 파일의 평문과 권한만 읽는다. 키체인 값은 조회하지 않는다. */
export async function readConfigFileSecurity(): Promise<ConfigFileSecurityFinding[]> {
  const file = await readConfigFile();
  if (file.state !== "ok") return [];
  const mode = await stat(CONFIG_PATH).then((info) => info.mode).catch(() => undefined);
  return assessConfigFileSecurity({
    platform: process.platform, mode, stored: file.stored,
    hasSecretStore: getSecretStore(CONFIG_PATH) !== null,
  });
}

let configFileSecurityWarned = false;

/** 고칠 수 있는 보안 문제만 프로세스마다 한 번 알린다. 읽기 경로에서는 저장하지 않는다. */
export async function warnConfigFileSecurity(): Promise<void> {
  if (configFileSecurityWarned) return;
  const failures = (await readConfigFileSecurity()).filter((finding) => finding.status === "fail");
  if (failures.length === 0 || configFileSecurityWarned) return;
  configFileSecurityWarned = true;
  const { fixes, explanation } = getConfigFileSecurityFixAdvice(failures);
  process.stderr.write(
    failures.map((finding) => `⚠  ${finding.message}\n`).join("") +
    `   ${explanation}\n` + fixes.map((fix) => `   수정: ${fix}\n`).join(""),
  );
}
