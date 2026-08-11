import { Command } from "commander";
import chalk from "chalk";
import { getConfig, setConfigValue } from "../config/store.js";
import { resolveConfigValue } from "../utils/config-value.js";
import { DoorayCliError } from "../utils/errors.js";
import { EXIT_CONFIG_ERROR } from "../utils/exit-codes.js";

function maskApiKey(key: string): string {
  if (key.length <= 8) return "****";
  return key.slice(0, 4) + "****" + key.slice(-4);
}

export const configCommand = new Command("config")
  .description("CLI 설정 관리");

configCommand
  .command("set")
  .description("설정 값 저장")
  .argument("<key>", "설정 키 (api-key, base-url)")
  .argument("<value>", "설정 값 (`-` 이면 stdin 에서 읽음)")
  .action(async (key: string, value: string) => {
    try {
      await setConfigValue(key, await resolveConfigValue(value));
      console.log(chalk.green(`✓ ${key} 설정 완료`));
    } catch (err) {
      if (err instanceof DoorayCliError) {
        console.error(chalk.red(err.message));
        process.exit(err.exitCode);
      }
      throw err;
    }
  });

configCommand
  .command("get")
  .description("설정 값 조회")
  .argument("[key]", "설정 키 (생략 시 전체 출력)")
  .action(async (key?: string) => {
    const config = await getConfig();
    if (!config) {
      console.error(chalk.red("설정 파일이 없습니다. dooray config set 으로 설정하세요."));
      process.exit(EXIT_CONFIG_ERROR);
    }

    const display: Record<string, string> = {
      "api-key": config.apiKey ? maskApiKey(config.apiKey) : "(미설정)",
      "base-url": config.baseUrl || "(미설정)",
    };

    if (key) {
      const val = display[key];
      if (val === undefined) {
        console.error(chalk.red(`알 수 없는 설정 키: ${key}\n사용 가능한 키: api-key, base-url`));
        process.exit(EXIT_CONFIG_ERROR);
      }
      console.log(`${key}: ${val}`);
    } else {
      for (const [k, v] of Object.entries(display)) {
        console.log(`${k}: ${v}`);
      }
    }
  });
