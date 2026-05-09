import { Command } from "commander";
import chalk from "chalk";
import path from "path";
import fs from "fs/promises";
import { getConfig, saveConfig } from "../config/store.js";
import { DoorayApiClient } from "../api/client.js";
import { ensureMe } from "../resolvers/me.js";
import { API_ENDPOINTS, DEFAULTS } from "../config/types.js";
import type { Config } from "../config/types.js";

export const setupCommand = new Command("setup")
  .description("대화형 초기 설정 마법사")
  .action(async () => {
    const { input, select, password, confirm } = await import(
      "@inquirer/prompts"
    );

    const existing = await getConfig();

    try {
      // 1. 테넌트명
      const tenantName = await input({
        message: "테넌트명을 입력하세요",
        default: existing?.tenantName ?? DEFAULTS.tenantName,
        theme: { prefix: "🏢" },
      });
      console.log(
        chalk.gray(
          `  접속 URL: https://${tenantName}.dooray.com`,
        ),
      );

      // 2. API Endpoint
      const endpointChoices = Object.entries(API_ENDPOINTS).map(
        ([name, url]) => ({
          name: `${name} (${url})`,
          value: url,
        }),
      );
      const defaultEndpoint =
        existing?.baseUrl ?? API_ENDPOINTS["민간 클라우드"];

      const baseUrl = await select<string>({
        message: "API Endpoint를 선택하세요",
        choices: endpointChoices,
        default: defaultEndpoint,
        theme: { prefix: "🌐" },
      });

      // 3. API Key (with retry loop)
      let apiKey = "";
      let meName = "";
      let verified = false;

      while (!verified) {
        apiKey = await password({
          message: `API Key를 입력하세요 (발급: https://${tenantName}.dooray.com/setting/api/token)`,
          mask: "*",
          theme: { prefix: "🔑" },
        });

        if (!apiKey) {
          console.log(chalk.red("  ✗ API Key는 필수입니다."));
          continue;
        }

        // 4. API 연결 테스트
        try {
          const client = new DoorayApiClient(apiKey, baseUrl);
          await client.getProjects({ page: 0, size: 1 });
          const me = await ensureMe(client);
          meName = me.name;
          console.log(chalk.green(`  ✓ API 연결 성공 (${meName})`));
          verified = true;
        } catch {
          console.log(
            chalk.red("  ✗ 연결 실패 — API Key를 확인해주세요"),
          );
        }
      }

      // 5. 메일 사용 여부
      const useMail = await confirm({
        message: "메일 기능을 사용하시겠습니까?",
        default: !!existing?.imapUsername,
        theme: { prefix: "📧" },
      });

      let imapUsername: string | undefined;
      let imapPassword: string | undefined;

      // 6. 메일 설정
      if (useMail) {
        imapUsername = await input({
          message: `IMAP 사용자 이메일 (확인: https://${tenantName}.dooray.com/setting/mail/general/read)`,
          default: existing?.imapUsername,
          theme: { prefix: "📨" },
        });

        imapPassword = await password({
          message: "IMAP 비밀번호",
          mask: "*",
          theme: { prefix: "🔒" },
        });
      }

      // 7. Claude Code 스킬 설치
      const claudeDir = path.join(
        process.env.HOME ?? process.env.USERPROFILE ?? "",
        ".claude",
      );
      const claudeDirExists = await fs
        .access(claudeDir)
        .then(() => true)
        .catch(() => false);

      if (claudeDirExists) {
        const isNpx =
          /_npx[/\\]/.test(__dirname) ||
          /\.npm[/\\]_npx/.test(__dirname) ||
          /npx-/.test(__dirname);

        if (isNpx) {
          console.log(
            chalk.yellow(
              "  ⚠ npx 환경에서는 스킬 설치가 불가합니다. npm i -g @bifos/dooray-cli 후 다시 시도하세요.",
            ),
          );
        } else {
          const installSkill = await confirm({
            message: "Claude Code 스킬을 설치하시겠습니까?",
            default: true,
            theme: { prefix: "🔧" },
          });

          if (installSkill) {
            try {
              const skillSrc = path.resolve(__dirname, "../skills/dooray-cli");
              const skillsDir = path.join(claudeDir, "skills");
              const skillDst = path.join(skillsDir, "dooray-cli");

              await fs.mkdir(skillsDir, { recursive: true });

              await fs
                .lstat(skillDst)
                .then(() => fs.rm(skillDst, { recursive: true, force: true }))
                .catch(() => {});

              await fs.symlink(skillSrc, skillDst);
              console.log(chalk.green("  ✓ Claude Code 스킬 설치 완료"));
            } catch (err) {
              console.log(
                chalk.yellow(
                  `  ⚠ 스킬 설치 실패: ${err instanceof Error ? err.message : String(err)}`,
                ),
              );
            }
          }
        }
      }

      // 8. feedback --last 모드 (opt-in)
      const trackLastRun = await confirm({
        message: "feedback --last 모드 활성화 (직전 명령 에러를 GitHub issue에 자동 첨부)?",
        default: false,
        theme: { prefix: "📋" },
      });

      // 9. 저장 (all-or-nothing)
      const config: Config = {
        version: 1,
        apiKey,
        baseUrl,
        tenantName,
        imapHost: useMail ? DEFAULTS.imapHost : existing?.imapHost,
        imapPort: useMail ? DEFAULTS.imapPort : existing?.imapPort,
        imapUsername: imapUsername ?? existing?.imapUsername,
        imapPassword: imapPassword ?? existing?.imapPassword,
        smtpHost: useMail ? DEFAULTS.smtpHost : existing?.smtpHost,
        smtpPort: useMail ? DEFAULTS.smtpPort : existing?.smtpPort,
      };
      config.trackLastRun = trackLastRun;

      await saveConfig(config);
      console.log(
        chalk.green(
          "\n✓ 설정 완료. dooray doctor로 상태를 확인할 수 있습니다.",
        ),
      );
    } catch (err) {
      if (
        err != null &&
        typeof err === "object" &&
        "name" in err &&
        (err as { name: string }).name === "ExitPromptError"
      ) {
        console.log(chalk.yellow("\n설정이 취소되었습니다."));
        return;
      }
      throw err;
    }
  });
