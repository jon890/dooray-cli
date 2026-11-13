/** 파일·키체인 없이 웹 인증 입력과 요청 주소를 검증한다. */
import type { Config } from "./types.js";
import { API_ENDPOINTS } from "./types.js";
import { DoorayCliError } from "../utils/errors.js";
import { EXIT_CONFIG_ERROR, EXIT_PARAM_ERROR } from "../utils/exit-codes.js";

export const WEB_AUTH_WARNING = "웹 방식은 비공식 웹 API 를 사용합니다. 예고 없이 바뀔 수 있으며 SESSION 쿠키는 로그인 계정의 모든 권한을 가집니다.";

export function parseSessionCookie(input: string): string {
  let value = input.trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1).trim();
  const header = /^Cookie:\s*/i.test(value);
  value = value.replace(/^Cookie:\s*/i, "");
  const pair = /^([^=;\s]+)=(.*)$/.exec(value);
  if (!header && pair && pair[1] !== "SESSION" && (!/^={0,1}$/.test(pair[2]) || /^(?:session|JSESSIONID)$/.test(pair[1]))) throw cookieError();
  if (header || value.includes(";") || value.startsWith("SESSION=")) {
    const values = new Set(value.split(";").flatMap((part) => {
      const index = part.indexOf("=");
      return index >= 0 && part.slice(0, index).trim() === "SESSION" ? [part.slice(index + 1).trim()] : [];
    }));
    if (values.size !== 1) throw cookieError();
    value = [...values][0]!;
  }
  if (!value || !/^[\x21-\x7e]+$/.test(value) || value.includes(";")) throw cookieError();
  return value;
}

function cookieError(): DoorayCliError {
  return new DoorayCliError("SESSION 쿠키 형식이 올바르지 않습니다. SESSION 값, SESSION=값 또는 Cookie: 헤더를 넣으세요.", EXIT_PARAM_ERROR);
}

export function resolveWebBaseUrl(config: Pick<Config, "baseUrl" | "tenantName">): string {
  const tenant = config.tenantName;
  const fail = () => new DoorayCliError("웹 접속 주소를 정할 수 없습니다. 클라우드와 테넌트 이름을 확인하세요: dooray setup", EXIT_CONFIG_ERROR);
  if (!tenant || tenant === "example" || !/^[a-z0-9-]+$/.test(tenant)) throw fail();
  let base: URL;
  try { base = new URL(config.baseUrl); } catch { throw fail(); }
  if (base.protocol !== "https:" || base.username || base.password || base.pathname !== "/" || base.search || base.hash || !Object.values(API_ENDPOINTS).some((value) => value === base.origin)) throw fail();
  const host = `${tenant}.${base.hostname.slice(4)}`;
  const url = new URL(`https://${host}`);
  if (url.hostname !== host || url.origin !== `https://${host}`) throw fail();
  return url.origin;
}

/** 빠진 항목 이름을 반환한다. 빈 배열이면 현재 인증 방식의 설정이 완료됐다. */
export function isConfigComplete(config: Config): string[] {
  const missing: string[] = [];
  if (!config.baseUrl) missing.push("base-url");
  if (config.authMode !== "web") {
    if (!config.apiKey) missing.push("api-key");
    return missing;
  }
  if (!config.sessionCookie) missing.push("session-cookie");
  if (!config.tenantName || config.tenantName === "example" || !/^[a-z0-9-]+$/.test(config.tenantName)) missing.push("tenant-name");
  try { resolveWebBaseUrl(config); } catch { if (!missing.includes("tenant-name") && !missing.includes("base-url")) missing.push("base-url"); }
  return missing;
}
