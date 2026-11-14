/** 영역별 지원 목록을 모아 API 호출 전에 지원하지 않는 명령·옵션을 막는다. */
import { DoorayCliError } from "../utils/errors.js";
import type { Command } from "commander";
import { EXIT_CONFIG_ERROR, EXIT_PARAM_ERROR } from "../utils/exit-codes.js";
import { projectWebSupport, projectWebAreaName } from "./web-support/project.js";
import { memberWebSupport, memberWebAreaName } from "./web-support/member.js";
import { postWebSupport, postWebAreaName } from "./web-support/post.js";
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
const exempt = new Set(["setup", "config", "doctor", "cache", "skill", "feedback", "mail"]);
export function isWebSupportExempt(path: string): boolean { return exempt.has(path.split(" ")[0]); }

export function assertWebSupported(path: string, options: Record<string, unknown>, mode: "api-key" | "web"): void {
  if (mode !== "web" || isWebSupportExempt(path)) return;
  const unsupportedOptions = Object.hasOwn(WEB_SUPPORTED_COMMANDS, path) ? WEB_SUPPORTED_COMMANDS[path] : undefined;
  if (!unsupportedOptions || unsupportedOptions.some((key) => options[key] !== undefined && options[key] !== false)) {
    throw new DoorayCliError("웹 방식에서는 지원하지 않습니다. auth-mode 를 api-key 로 바꾸세요.", EXIT_PARAM_ERROR);
  }
}

/** Commander 의 명령 경로・옵션을 모으고, 설정 읽기 실패는 기존 명령의 검사 순서에 맡긴다. */
export async function guardWebCommand(actionCommand: Command, readMode: () => Promise<"api-key" | "web">): Promise<void> {
  const parts: string[] = [];
  for (let current: Command | null = actionCommand; current?.parent; current = current.parent) parts.unshift(current.name());
  const commandPath = parts.join(" ");
  if (isWebSupportExempt(commandPath)) return;
  let mode: "api-key" | "web";
  try { mode = await readMode(); }
  catch (error) {
    if (error instanceof DoorayCliError && error.exitCode === EXIT_CONFIG_ERROR) return;
    throw error;
  }
  const explicit = new Set<string>();
  for (let current: Command | null = actionCommand; current; current = current.parent) {
    for (const key of Object.keys(current.opts())) if (current.getOptionValueSource(key) === "cli") explicit.add(key);
  }
  const options = Object.fromEntries(Object.entries(actionCommand.optsWithGlobals()).filter(([key]) => explicit.has(key)));
  assertWebSupported(commandPath, options, mode);
}
