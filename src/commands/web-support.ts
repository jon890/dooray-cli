/** 영역별 지원 목록을 모아 API 호출 전에 지원하지 않는 명령·옵션을 막는다. */
import { DoorayCliError } from "../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../utils/exit-codes.js";
import { projectWebSupport } from "./web-support/project.js";
import { memberWebSupport } from "./web-support/member.js";

export const WEB_SUPPORTED_COMMANDS: Readonly<Record<string, readonly string[]>> = {
  ...projectWebSupport,
  ...memberWebSupport,
};
const exempt = new Set(["setup", "config", "doctor", "cache", "skill", "feedback", "mail"]);
export function isWebSupportExempt(path: string): boolean { return exempt.has(path.split(" ")[0]); }

export function assertWebSupported(path: string, options: Record<string, unknown>, mode: "api-key" | "web"): void {
  if (mode !== "web" || isWebSupportExempt(path)) return;
  const unsupportedOptions = WEB_SUPPORTED_COMMANDS[path];
  if (!unsupportedOptions || unsupportedOptions.some((key) => options[key] !== undefined && options[key] !== false)) {
    throw new DoorayCliError("웹 방식에서는 지원하지 않습니다. auth-mode 를 api-key 로 바꾸세요.", EXIT_PARAM_ERROR);
  }
}
