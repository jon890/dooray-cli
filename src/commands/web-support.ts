/** 영역별 지원 목록을 모아 API 호출 전에 지원하지 않는 명령·옵션을 막는다. */
import { DoorayCliError } from "../utils/errors.js";
import type { Command } from "commander";
import { createClient, type DoorayClient } from "@/api/dooray-client.js";
import { WebSessionExpiredError } from "@/api/web/http.js";
import { configReadErrorMessage, getConfig, warnConfigFileSecurity } from "@/config/store.js";
import { EXIT_CONFIG_ERROR, EXIT_PARAM_ERROR } from "../utils/exit-codes.js";
import { projectWebSupport, projectWebAreaName } from "./web-support/project.js";
import { memberWebSupport, memberWebAreaName } from "./web-support/member.js";
import { postWebSupport, postWebAreaName, postWebOnlySupport } from "./web-support/post.js";
import { wikiWebSupport, wikiWebAreaName } from "./web-support/wiki.js";
import { messengerWebSupport, messengerWebAreaName } from "./web-support/messenger.js";
import { calendarWebSupport, calendarWebAreaName } from "./web-support/calendar.js";
import { streamWebSupport, streamWebAreaName } from "./web-support/stream.js";
export const WEB_AREA_NAMES = { project: projectWebAreaName, member: memberWebAreaName, post: postWebAreaName, wiki: wikiWebAreaName, messenger: messengerWebAreaName, calendar: calendarWebAreaName, stream: streamWebAreaName };

export const WEB_SUPPORT_BY_DOMAIN = {
  project: projectWebSupport, member: memberWebSupport,
  post: postWebSupport, wiki: wikiWebSupport, messenger: messengerWebSupport,
  calendar: calendarWebSupport, stream: streamWebSupport,
};

export const WEB_SUPPORTED_COMMANDS: Readonly<Record<string, readonly string[]>> = {
  ...projectWebSupport,
  ...memberWebSupport,
  ...postWebSupport, ...wikiWebSupport, ...messengerWebSupport, ...calendarWebSupport, ...streamWebSupport,
};
export const WEB_ONLY_COMMANDS = Object.keys(postWebOnlySupport);
const exempt = new Set(["setup", "config", "doctor", "cache", "skill", "feedback", "mail"]);
export function isWebSupportExempt(path: string): boolean { return exempt.has(path.split(" ")[0]); }

export function assertWebSupported(path: string, options: Record<string, unknown>, mode: "api-key" | "web"): void {
  if (mode !== "web" || isWebSupportExempt(path)) return;
  const unsupportedOptions = Object.hasOwn(WEB_SUPPORTED_COMMANDS, path) ? WEB_SUPPORTED_COMMANDS[path] : undefined;
  if (!unsupportedOptions || unsupportedOptions.some((key) => options[key] !== undefined && options[key] !== false)) {
    throw new DoorayCliError("웹 방식에서는 지원하지 않습니다. auth-mode 를 api-key 로 바꾸세요.", EXIT_PARAM_ERROR);
  }
}

function getCommandPath(actionCommand: Command): string {
  const parts: string[] = [];
  for (let current: Command | null = actionCommand; current?.parent; current = current.parent) parts.unshift(current.name());
  return parts.join(" ");
}

/** 웹 전용 명령이 대상 조회와 쓰기를 같은 웹 세션으로 수행한다. */
export async function runWebOnlyCommand<T>(
  command: Command,
  run: (client: DoorayClient, useProjectCache: boolean) => Promise<T>,
): Promise<T> {
  const path = getCommandPath(command);
  if (!WEB_ONLY_COMMANDS.includes(path)) throw new Error(`웹 전용 명령 목록에 없습니다: ${path}`);

  const setupMessage = `${path} 명령은 웹 API 에서만 지원합니다. 브라우저에서 SESSION 쿠키를 꺼내 dooray config set session-cookie - 로 저장하세요.`;
  const result = await getConfig({ sessionOnly: true });
  if (result.state === "invalid" || result.state === "unreadable") {
    throw new DoorayCliError(configReadErrorMessage(result), EXIT_CONFIG_ERROR);
  }
  if (result.state === "absent") throw new DoorayCliError(setupMessage, EXIT_PARAM_ERROR);

  await warnConfigFileSecurity();
  const { config } = result;
  const webMode = config.authMode === "web";
  if (!webMode && !config.sessionCookie) throw new DoorayCliError(setupMessage, EXIT_PARAM_ERROR);
  const client = createClient({ ...config, authMode: "web" });
  try {
    return await run(client, webMode);
  } catch (error) {
    if (!webMode && error instanceof WebSessionExpiredError) throw new DoorayCliError(setupMessage, EXIT_PARAM_ERROR);
    throw error;
  }
}

/** Commander 의 명령 경로・옵션을 모으고, 설정 읽기 실패는 기존 명령의 검사 순서에 맡긴다. */
export async function guardWebCommand(actionCommand: Command, readMode: () => Promise<"api-key" | "web">): Promise<void> {
  const commandPath = getCommandPath(actionCommand);
  if (isWebSupportExempt(commandPath)) return;
  let mode: "api-key" | "web";
  try { mode = await readMode(); }
  catch (error) {
    if (error instanceof DoorayCliError && error.exitCode === EXIT_CONFIG_ERROR) return;
    throw error;
  }
  // env 출처 옵션을 추가하면 환경 변수로 명시한 값도 검사할지 이 조건을 다시 본다.
  const explicit = new Set<string>();
  for (let current: Command | null = actionCommand; current; current = current.parent) {
    for (const key of Object.keys(current.opts())) if (current.getOptionValueSource(key) === "cli") explicit.add(key);
  }
  const options = Object.fromEntries(Object.entries(actionCommand.optsWithGlobals()).filter(([key]) => explicit.has(key)));
  assertWebSupported(commandPath, options, WEB_ONLY_COMMANDS.includes(commandPath) ? "web" : mode);
}
