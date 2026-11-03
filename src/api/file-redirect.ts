/**
 * 첨부 파일 API 의 307 을 따라갈 때 쓰는 판정과 요청 helper (ADR-074).
 *
 * 첨부 다운로드·업로드는 api 서버가 307 로 파일 서버(`file-api.<도메인>`)를 가리키고,
 * 클라이언트가 그 `location` 에 인증 헤더를 다시 실어 요청한다 (ADR-015).
 * `location` 은 응답이 정하는 값이라, 확인 없이 따라가면 토큰이 다른 호스트로 나갈 수 있다.
 */
import { isIP } from "node:net";
import { DoorayCliError } from "../utils/errors.js";
import { EXIT_API_ERROR } from "../utils/exit-codes.js";
import { sanitizeForTerminal } from "../utils/sanitize.js";

/** 파일 서버의 응답 헤더를 기다리는 시간. 다운로드에만 쓴다. 업로드는 본문 전송이 끝나야 헤더가 와서 이 값이 전송 시간 제한이 된다. */
export const FILE_RESPONSE_TIMEOUT_MS = 30_000;

/**
 * 인증 헤더를 실어 보내도 되는 파일 서버 주소인지 본다.
 *
 * API 주소가 `api.` 로 시작하면 그 `api` 를 뺀 도메인과 그 하위 도메인을, 그 밖에는 API 호스트 자신만 `https` 일 때 허용한다.
 * `https://api.dooray.com` 이면 `file-api.dooray.com` 은 되고 `dooray.com.example.net` 은 안 된다.
 * IP 주소나 `api.` 로 시작하지 않는 사용자 지정 주소에서 앞 이름을 무조건 떼면 `co.kr` 같은 넓은 범위를 믿게 된다.
 */
export function isTrustedFileHost(location: string, baseUrl: string): boolean {
  let target: URL;
  let base: URL;
  try {
    target = new URL(location);
    base = new URL(baseUrl);
  } catch {
    return false;
  }
  if (target.protocol !== "https:") return false;
  const host = base.hostname;
  const labels = host.split(".");
  if (isIP(host) !== 0 || labels[0] !== "api" || labels.length < 3) return target.hostname === host;
  const domain = labels.slice(1).join(".");
  return target.hostname === domain || target.hostname.endsWith(`.${domain}`);
}

/** 판정에 걸린 주소를 오류에 실을 때 쓴다. 경로와 쿼리에는 서명 같은 값이 있을 수 있어 origin 만 낸다. */
export function describeOrigin(location: string): string {
  try {
    return sanitizeForTerminal(new URL(location).origin);
  } catch {
    return "(읽을 수 없는 주소)";
  }
}

/**
 * 응답 헤더가 올 때까지만 시간을 재는 `fetch`.
 *
 * 전체 시간을 끊으면 큰 파일 다운로드·업로드가 중간에 잘린다. 서버가 응답하지 않아 명령이
 * 끝나지 않는 것을 막는 것이 목적이므로, 헤더를 받은 뒤에는 타이머를 지운다.
 */
export async function fetchWithResponseTimeout(
  url: string,
  init: RequestInit,
  label: string,
  timeoutMs: number = FILE_RESPONSE_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e) {
    if (controller.signal.aborted) {
      throw new DoorayCliError(
        `${label} 실패: 서버가 ${Math.round(timeoutMs / 1000)}초 안에 응답하지 않았습니다.`,
        EXIT_API_ERROR,
      );
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
