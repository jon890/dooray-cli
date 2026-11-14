import { Command } from "commander";
import chalk from "chalk";
import { configReadErrorMessage, getConfig, readSessionCookie, warnConfigFileSecurity } from "../config/store.js";
import { WEB_AUTH_WARNING } from "../config/web-auth.js";
import { updateConfigValue } from "../services/config.js";
import { resolveConfigValue } from "../utils/config-value.js";
import { DoorayCliError } from "../utils/errors.js";
import { EXIT_CONFIG_ERROR } from "../utils/exit-codes.js";

/**
 * 캐시를 비웠을 때 덧붙이는 한 줄. 무엇이 바뀌어서 비웠는지를 키에 따라 가른다 (ADR-042).
 *
 * 실제로 지운 것이 있었을 때만 부른다. 지울 캐시가 없었으면 이 문장이 나오지 않는다.
 */
function cacheClearedNotice(key: string): string {
  const reason =
    key === "api-key" || key === "session-cookie"
      ? "계정이 바뀌었을 수 있어"
      : key === "auth-mode" ? "접속 경로가 바뀌어" : "접속 환경이 바뀌었을 수 있어";
  return `  ${reason} 캐시를 비웠습니다. 다음 조회가 API 를 다시 호출합니다.`;
}

function maskApiKey(key: string): string {
  if (key.length <= 8) return "****";
  return key.slice(0, 4) + "****" + key.slice(-4);
}

export const configCommand = new Command("config")
  .description("CLI 설정 관리");

configCommand
  .command("set")
  .description("설정 값 저장")
  .argument("<key>", "설정 키 (api-key, auth-mode, session-cookie, base-url 등)")
  .argument("<value>", "설정 값 (`-` 이면 stdin 에서 읽음)")
  .action(async (key: string, value: string) => {
    const resolvedValue = await resolveConfigValue(value);
    const { cacheCleared } = await updateConfigValue(
      key,
      resolvedValue,
    );
    console.log(chalk.green(`✓ ${key} 설정 완료`));
    if (key === "auth-mode" && resolvedValue === "web") process.stderr.write(`⚠ ${WEB_AUTH_WARNING}\n`);
    if (cacheCleared) console.log(chalk.gray(cacheClearedNotice(key)));
  });

configCommand
  .command("get")
  .description("설정 값 조회")
  .argument("[key]", "설정 키 (생략 시 전체 출력)")
  .action(async (key?: string) => {
    const result = await getConfig();
    if (result.state === "invalid" || result.state === "unreadable") {
      // 손상과 읽기 실패(키체인 포함)는 「파일이 없다」 로 뭉개지 않고 실제 이유를 보인다.
      throw new DoorayCliError(configReadErrorMessage(result), EXIT_CONFIG_ERROR);
    }
    if (result.state !== "ok") {
      throw new DoorayCliError(
        "설정 파일이 없습니다. dooray config set 으로 설정하세요.",
        EXIT_CONFIG_ERROR,
      );
    }
    const config = result.config;
    await warnConfigFileSecurity();
    const cookie = key === undefined || key === "session-cookie"
      ? (config.authMode === "web" ? config.sessionCookie : await readSessionCookie()) : undefined;

    const display: Record<string, string> = {
      "auth-mode": config.authMode ?? "api-key",
      "session-cookie": cookie ? "설정됨" : "미설정",
      "api-key": config.apiKey ? maskApiKey(config.apiKey) : "(미설정)",
      "base-url": config.baseUrl || "(미설정)",
    };

    if (key) {
      const val = display[key];
      if (val === undefined) {
        throw new DoorayCliError(
          `알 수 없는 설정 키: ${key}\n사용 가능한 키: ${Object.keys(display).join(", ")}`,
          EXIT_CONFIG_ERROR,
        );
      }
      console.log(`${key}: ${val}`);
    } else {
      for (const [k, v] of Object.entries(display)) {
        console.log(`${k}: ${v}`);
      }
    }
  });
