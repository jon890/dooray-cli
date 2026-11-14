/** 인증 방식별 구현이 공유하는 영역 계약과 클라이언트 선택 함수다. */
import type { ProjectClient } from "./project/types.js";
import type { MemberClient } from "./member/types.js";
import type { PostClient } from "./post/types.js";
import type { WikiClient } from "./wiki/types.js";
import type { MessengerClient } from "./messenger/types.js";
import type { CalendarClient } from "./calendar/types.js";
import type { StreamClient } from "./stream/types.js";
import type { Config } from "../config/types.js";
import { DoorayApiClient } from "./client.js";
import { createWebClient } from "./web/index.js";
import { resolveWebBaseUrl, parseSessionCookie } from "../config/web-auth.js";
import { DoorayCliError } from "../utils/errors.js";
import { EXIT_CONFIG_ERROR } from "../utils/exit-codes.js";

export type DoorayClient = ProjectClient & MemberClient & PostClient & WikiClient & MessengerClient & CalendarClient & StreamClient;

export function createClient(config: Config): DoorayClient {
  if (config.authMode !== "web") return new DoorayApiClient(config.apiKey, config.baseUrl);
  const baseUrl = resolveWebBaseUrl(config);
  if (!config.sessionCookie) throw new DoorayCliError("SESSION 쿠키가 없습니다. dooray setup 을 실행하세요.", EXIT_CONFIG_ERROR);
  return createWebClient(parseSessionCookie(config.sessionCookie), baseUrl, config.baseUrl);
}
