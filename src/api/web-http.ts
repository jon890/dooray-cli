/** 웹 세션 요청만 담당한다. 쿠키는 검증한 origin 에만 붙이고 오류에 주소·비밀값을 남기지 않는다. */
import ky, { HTTPError, type Options } from "ky";
import { DoorayCliError } from "../utils/errors.js";
import { EXIT_API_ERROR, EXIT_AUTH_ERROR, EXIT_RATE_LIMITED } from "../utils/exit-codes.js";
import { createTokenBucket, parseRateLimitHeaders } from "./rate-limiter.js";
import { parseJsonPreservingLargeIntegers } from "./json-large-integer.js";
import type { DoorayApiHeader } from "./types.js";

export interface WebEnvelope {
  header: DoorayApiHeader;
  result: unknown;
  totalCount?: number;
  references?: unknown;
}

export const SESSION_EXPIRED_MESSAGE = "세션이 끝났거나 쿠키가 틀렸습니다. 브라우저에서 SESSION 쿠키를 꺼내 dooray config set session-cookie - 로 다시 넣으세요.";

export class WebHttp {
  private readonly api;
  private readonly origin: string;

  constructor(baseUrl: string, private readonly cookie: string) {
    this.origin = new URL(baseUrl).origin;
    if (new URL(baseUrl).protocol !== "https:") throw new DoorayCliError("웹 요청은 https 주소만 지원합니다.", EXIT_API_ERROR);
    const bucket = createTokenBucket();
    this.api = ky.create({
      prefix: baseUrl,
      redirect: "manual",
      timeout: 15000,
      parseJson: parseJsonPreservingLargeIntegers,
      retry: { limit: 3, statusCodes: [408, 429, 500, 502, 503, 504], backoffLimit: 8000, jitter: true },
      hooks: {
        beforeRequest: [async ({ request }) => {
          if (new URL(request.url).origin !== this.origin) throw new DoorayCliError("웹 요청 주소가 허용 범위를 벗어났습니다.", EXIT_API_ERROR);
          request.headers.delete("Authorization");
          request.headers.set("Cookie", `SESSION=${cookie}`);
          await bucket.acquire();
        }],
        beforeRetry: [async ({ error }) => {
          if (error instanceof HTTPError && error.response.status === 429) bucket.drain();
          await bucket.acquire();
        }],
        afterResponse: [({ response }) => { bucket.sync(parseRateLimitHeaders(response.headers)); }],
      },
    });
  }

  private safeMessage(message: string): string {
    return message.split(this.cookie).join("***")
      .split(new URL(this.origin).hostname).join("<host>")
      .replace(/https?:\/\/[^\s<>"']+/gi, "<url>")
      .replace(/SESSION\s*=\s*[^\s;,]+/gi, "SESSION=***");
  }

  async request(input: string | URL | Request, options?: Options): Promise<WebEnvelope> {
    try {
      let errorBody: unknown;
      let bodyWasRead = false;
      const response = await this.api(input, { ...options, redirect: "manual" }).catch((error: unknown) => {
        if (error instanceof HTTPError) {
          // ky 2 는 HTTPError.data 를 채우면서 원본 응답 본문을 이미 읽는다.
          errorBody = error.data;
          bodyWasRead = true;
          return error.response;
        }
        throw error;
      });
      const status = response.status;
      let signin = false;
      if (status >= 300 && status < 400) {
        try { signin = new URL(response.headers.get("location") ?? "", this.origin).pathname.startsWith("/auth/signin"); } catch { /* 주소를 노출하지 않고 일반 리다이렉트로 처리한다. */ }
      }
      if (status === 401 || signin) throw new DoorayCliError(SESSION_EXPIRED_MESSAGE, EXIT_AUTH_ERROR);
      if (status === 403) throw new DoorayCliError("이 계정에는 그 대상의 권한이 없습니다.", EXIT_AUTH_ERROR);
      if (status >= 300 && status < 400) throw new DoorayCliError("웹이 다른 주소로 보냈습니다. 리다이렉트는 따라가지 않습니다.", EXIT_API_ERROR);
      if (status === 429) throw new DoorayCliError("API 호출 한도를 넘었습니다 (429). 잠시 뒤 다시 실행하세요.", EXIT_RATE_LIMITED);
      let body: unknown;
      try {
        body = bodyWasRead
          ? (typeof errorBody === "string" ? parseJsonPreservingLargeIntegers(errorBody) : errorBody)
          : parseJsonPreservingLargeIntegers(await response.text());
      } catch {
        if (!response.ok) throw new DoorayCliError(`웹 API 호출 실패 (${status}).`, EXIT_API_ERROR);
        throw new DoorayCliError("웹 응답이 JSON 이 아닙니다.", EXIT_API_ERROR);
      }
      const obj = body as Partial<WebEnvelope> | null;
      if (!response.ok || obj?.header?.isSuccessful === false) {
        const message = typeof obj?.header?.resultMessage === "string" ? this.safeMessage(obj.header.resultMessage) : `상태 코드 ${status}`;
        throw new DoorayCliError(`웹 API 호출 실패: ${message}`, EXIT_API_ERROR);
      }
      if (!obj || typeof obj !== "object" || !obj.header || obj.header.isSuccessful !== true || !("result" in obj)) {
        throw new DoorayCliError("웹 응답 구조가 올바르지 않습니다.", EXIT_API_ERROR);
      }
      return obj as WebEnvelope;
    } catch (error) {
      if (error instanceof DoorayCliError) throw error;
      throw new DoorayCliError(error instanceof Error && error.name === "TimeoutError" ? "웹 요청 시간이 초과됐습니다." : "웹 요청 중 네트워크 오류가 발생했습니다.", EXIT_API_ERROR);
    }
  }
}
