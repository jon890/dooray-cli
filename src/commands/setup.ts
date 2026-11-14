import { Command } from "commander";
import chalk from "chalk";
import path from "path";
import fs from "fs/promises";
import { createSkillManagerContext } from "../skill/context.js";
import { installSkill } from "../skill/manager.js";
import { configReadErrorMessage, getConfig } from "../config/store.js";
import { DoorayCliError } from "../utils/errors.js";
import { EXIT_CONFIG_ERROR, EXIT_AUTH_ERROR, EXIT_PARAM_ERROR } from "../utils/exit-codes.js";
import { replaceConfig } from "../services/config.js";
import { createClient } from "../api/dooray-client.js";
import { SESSION_EXPIRED_MESSAGE } from "../api/web/http.js";
import { parseSessionCookie, resolveWebBaseUrl, WEB_AUTH_WARNING } from "../config/web-auth.js";
import { ensureMe } from "../resolvers/me.js";
import { API_ENDPOINTS, DEFAULTS } from "../config/types.js";
import type { Config } from "../config/types.js";

export const setupCommand = new Command("setup")
  .description("대화형 초기 설정 마법사")
  .action(async () => {
    const { input, select, password, confirm } = await import(
      "@inquirer/prompts"
    );

    const existingResult = await getConfig();
    // 키체인을 읽지 못하면 마지막 저장도 같은 읽기에서 실패한다.
    // 마법사 입력을 다 받은 뒤 버리지 않도록 시작하기 전에 끝낸다.
    if (existingResult.state === "unreadable" && existingResult.source === "keychain") {
      throw new DoorayCliError(configReadErrorMessage(existingResult), EXIT_CONFIG_ERROR);
    }
    const existing =
      existingResult.state === "ok" ? existingResult.config : undefined;
    if (existingResult.state === "unreadable") {
      console.log(
        chalk.yellow(
          `  ⚠ 기존 설정 파일을 읽지 못했습니다. 저장도 실패할 수 있습니다: ${existingResult.reason}`,
        ),
      );
    } else if (existingResult.state === "invalid") {
      console.log(
        chalk.yellow(
          `  ⚠ 기존 설정 파일이 손상되어 기본값으로 쓰지 않습니다: ${existingResult.reason}`,
        ),
      );
    }

    try {
      const authMode = await select<"api-key" | "web">({
        message: "인증 방식을 선택하세요",
        choices: [{ name: "API 키 (공개 API)", value: "api-key" }, { name: "웹 로그인 세션 (비공식 웹 API)", value: "web" }],
        default: existing?.authMode ?? "api-key",
      });
      if (authMode === "web") process.stderr.write(`⚠ ${WEB_AUTH_WARNING}\n`);
      let tenantName = await input({
        message: "테넌트명을 입력하세요",
        ...(authMode === "api-key" && { default: existing?.tenantName ?? DEFAULTS.tenantName }),
        theme: { prefix: "🏢" },
      });
      const baseUrl = await select<string>({
        message: "API Endpoint를 선택하세요",
        choices: Object.entries(API_ENDPOINTS).map(([name, url]) => ({ name: `${name} (${url})`, value: url })),
        default: existing?.baseUrl ?? API_ENDPOINTS["민간 클라우드"],
        theme: { prefix: "🌐" },
      });
      let apiKey = existing?.apiKey ?? "";
      let sessionCookie = existing?.sessionCookie;
      if (authMode === "web") {
        let verified = false;
        while (!verified) {
          try {
            const webUrl = resolveWebBaseUrl({ baseUrl, tenantName });
            console.log(`  접속 URL: ${webUrl}`);
          } catch (error) {
            console.log(chalk.red(error instanceof Error ? error.message : "접속 주소를 확인하세요."));
            tenantName = await input({ message: "테넌트명을 다시 입력하세요" });
            continue;
          }
          console.log("  브라우저 개발자 도구 → Application → Cookies 에서 SESSION 값을 복사하세요. 브라우저 로그아웃·세션 만료 뒤에는 다시 넣어야 합니다.");
          try {
            sessionCookie = parseSessionCookie(await password({ message: "SESSION 쿠키를 입력하세요", mask: "*" }));
            const response = await createClient({ version: 1, apiKey, authMode, baseUrl, tenantName, sessionCookie }).getMe();
            console.log(chalk.green(`  ✓ 웹 연결 성공 (${response.result.name})`));
            verified = true;
          } catch (error) {
            if (error instanceof DoorayCliError && (error.exitCode === EXIT_PARAM_ERROR || (error.exitCode === EXIT_AUTH_ERROR && error.message === SESSION_EXPIRED_MESSAGE))) {
              console.log(chalk.red(error.message));
              continue;
            }
            if (error instanceof DoorayCliError && error.exitCode === EXIT_CONFIG_ERROR) {
              console.log(chalk.red(error.message));
              tenantName = await input({ message: "테넌트명을 다시 입력하세요" });
              continue;
            }
            throw error;
          }
        }
      } else {
        let verified = false;
        while (!verified) {
          apiKey = await password({ message: `API Key를 입력하세요 (발급: https://${tenantName}.dooray.com/setting/api/token)`, mask: "*", theme: { prefix: "🔑" } });
          if (!apiKey) { console.log(chalk.red("  ✗ API Key는 필수입니다.")); continue; }
          try {
            const client = createClient({ version: 1, apiKey, authMode, baseUrl, tenantName });
            await client.getProjects({ page: 0, size: 1 });
            const me = await ensureMe(client);
            console.log(chalk.green(`  ✓ API 연결 성공 (${me.name})`));
            verified = true;
          } catch { console.log(chalk.red("  ✗ 연결 실패 — API Key를 확인해주세요")); }
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

      // 7. Claude Code·Codex 스킬 설치
      const skillContext = createSkillManagerContext();
      const agentDirectories = await Promise.all(
        [".claude", ".codex", ".agents"].map((directory) =>
          fs.access(path.join(skillContext.homeDir, directory))
            .then(() => true)
            .catch(() => false),
        ),
      );

      if (agentDirectories.some(Boolean)) {
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
          const shouldInstallSkill = await confirm({
            message: "Claude Code·Codex 스킬을 설치하시겠습니까?",
            default: true,
            theme: { prefix: "🔧" },
          });

          if (shouldInstallSkill) {
            try {
              await installSkill(skillContext);
              console.log(chalk.green("  ✓ Claude Code·Codex 스킬 설치 완료"));
            } catch (err) {
              const reason = err instanceof Error ? err.message : String(err);
              console.log(
                chalk.yellow(
                  `  ⚠ 스킬 설치 실패: ${reason}\n  필요하면 내용을 확인한 뒤 dooray skill update --force를 실행하세요.`,
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
        ...existing,
        version: 1,
        authMode,
        ...(sessionCookie !== undefined && { sessionCookie }),
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

      // setup 은 existing 을 들고 있지만 직접 비교하지 않는다.
      // 판정 규칙이 두 곳에 생기면 config 키가 늘어날 때 한쪽이 빠진다 (ADR-042).
      const { cacheCleared } = await replaceConfig(config);
      console.log(
        chalk.green(
          "\n✓ 설정 완료. dooray doctor로 상태를 확인할 수 있습니다.",
        ),
      );
      if (cacheCleared) {
        console.log(
          chalk.gray(
            "  계정이나 접속 환경이 바뀌어 캐시를 비웠습니다. 다음 조회가 API 를 다시 호출합니다.",
          ),
        );
      }
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
