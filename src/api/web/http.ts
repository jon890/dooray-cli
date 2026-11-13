/** 웹 JSON·첨부 전송의 인증·오류 경계. 쿠키는 확인한 주소에만 붙인다. */
import ky, { HTTPError, type Options } from "ky";
import { DoorayCliError } from "../../utils/errors.js";
import { EXIT_API_ERROR, EXIT_AUTH_ERROR, EXIT_RATE_LIMITED } from "../../utils/exit-codes.js";
import { createTokenBucket, parseRateLimitHeaders } from "../rate-limiter.js";
import { parseJsonPreservingLargeIntegers } from "../json-large-integer.js";
import { fetchWithResponseTimeout, isTrustedFileHost } from "../file-redirect.js";
import type { DoorayApiHeader } from "../types.js";

export interface WebEnvelope { header: DoorayApiHeader; result: unknown; totalCount?: number; references?: unknown; }
export type WebFileOptions = Omit<RequestInit, "body"> & { searchParams?: Record<string, string | number | boolean | undefined> };
export const SESSION_EXPIRED_MESSAGE = "세션이 끝났거나 쿠키가 틀렸습니다. 브라우저에서 SESSION 쿠키를 꺼내 dooray config set session-cookie - 로 다시 넣으세요.";

export class WebHttp {
  private readonly api;
  private readonly origin: string;
  private readonly bucket = createTokenBucket();
  constructor(baseUrl: string, private readonly cookie: string, private readonly publicApiBaseUrl: string) {
    this.origin = new URL(baseUrl).origin;
    if (new URL(baseUrl).protocol !== "https:") throw new DoorayCliError("웹 요청은 https 주소만 지원합니다.", EXIT_API_ERROR);
    const bucket = this.bucket;
    this.api = ky.create({
      prefix: baseUrl, redirect: "manual", timeout: 15000, parseJson: parseJsonPreservingLargeIntegers,
      retry: { limit: 3, statusCodes: [408, 429, 500, 502, 503, 504], backoffLimit: 8000, jitter: true },
      hooks: {
        beforeRequest: [async ({ request }) => {
          this.assertOrigin(request.url);
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

  private assertOrigin(url: string): void {
    if (new URL(url).origin !== this.origin) throw new DoorayCliError("웹 요청 주소가 허용 범위를 벗어났습니다.", EXIT_API_ERROR);
  }
  private safeMessage(message: string): string {
    return message.split(this.cookie).join("***").split(new URL(this.origin).hostname).join("<host>")
      .replace(/https?:\/\/[^\s<>"']+/gi, "<url>").replace(/SESSION\s*=\s*[^\s;,]+/gi, "SESSION=***");
  }
  private safeError(error: unknown): DoorayCliError {
    if (error instanceof DoorayCliError) return error;
    return new DoorayCliError(error instanceof Error && error.name === "TimeoutError" ? "웹 요청 시간이 초과됐습니다." : "웹 요청 중 네트워크 오류가 발생했습니다.", EXIT_API_ERROR);
  }
  private assertStatus(response: Response, allowFileRedirect = false): void {
    const status = response.status;
    let signin = false;
    if (status >= 300 && status < 400) {
      try { signin = new URL(response.headers.get("location") ?? "", this.origin).pathname.startsWith("/auth/signin"); } catch { /* 주소는 메시지에 넣지 않는다. */ }
    }
    if (status === 401 || signin) throw new DoorayCliError(SESSION_EXPIRED_MESSAGE, EXIT_AUTH_ERROR);
    if (status === 403) throw new DoorayCliError("이 계정에는 그 대상의 권한이 없습니다.", EXIT_AUTH_ERROR);
    if (status >= 300 && status < 400 && !(allowFileRedirect && status === 307)) throw new DoorayCliError("웹이 다른 주소로 보냈습니다. 리다이렉트는 따라가지 않습니다.", EXIT_API_ERROR);
    if (status === 429) throw new DoorayCliError("API 호출 한도를 넘었습니다 (429). 잠시 뒤 다시 실행하세요.", EXIT_RATE_LIMITED);
  }
  private isLoginHtml(response: Response, prefix: string): boolean {
    const attachment = /^attachment(?:;|$)/i.test(response.headers.get("content-disposition") ?? "");
    const html = /^\s*(?:<!doctype\s+html|<html|<head|<body|<form)/i.test(prefix);
    return (!attachment && (/text\/html/i.test(response.headers.get("content-type") ?? "") || html)) || (html && /auth\/signin|\blogin\b|로그인/i.test(prefix));
  }
  private throwBodyFailure(body: unknown, response: Response): void {
    const obj = body as Partial<WebEnvelope> | null;
    if (!response.ok || obj?.header?.isSuccessful === false) {
      const message = typeof obj?.header?.resultMessage === "string" ? this.safeMessage(obj.header.resultMessage) : `상태 코드 ${response.status}`;
      throw new DoorayCliError(`웹 API 호출 실패: ${message}`, EXIT_API_ERROR);
    }
  }
  private async readEnvelope(response: Response, bodyWasRead = false, errorBody?: unknown): Promise<WebEnvelope> {
    let body = errorBody;
    if (!bodyWasRead || typeof errorBody === "string") {
      const raw = bodyWasRead ? errorBody as string : await response.text();
      if (response.ok && this.isLoginHtml(response, raw.slice(0, 4096))) throw new DoorayCliError(SESSION_EXPIRED_MESSAGE, EXIT_AUTH_ERROR);
      try { body = parseJsonPreservingLargeIntegers(raw); } catch {
        if (!response.ok) throw new DoorayCliError(`웹 API 호출 실패 (${response.status}).`, EXIT_API_ERROR);
        throw new DoorayCliError("웹 응답이 JSON 이 아닙니다.", EXIT_API_ERROR);
      }
    }
    this.throwBodyFailure(body, response);
    const obj = body as Partial<WebEnvelope> | null;
    if (!obj || typeof obj !== "object" || !obj.header || obj.header.isSuccessful !== true || !("result" in obj)) throw new DoorayCliError("웹 응답 구조가 올바르지 않습니다.", EXIT_API_ERROR);
    return obj as WebEnvelope;
  }
  async request(input: string | URL | Request, options?: Options): Promise<WebEnvelope> {
    try {
      let errorBody: unknown, bodyWasRead = false;
      const response = await this.api(input, { ...options, redirect: "manual" }).catch((error: unknown) => {
        if (error instanceof HTTPError) { errorBody = error.data; bodyWasRead = true; return error.response; }
        throw error;
      });
      this.assertStatus(response);
      return await this.readEnvelope(response, bodyWasRead, errorBody);
    } catch (error) { throw this.safeError(error); }
  }

  /** 검증한 응답만 돌려준다. 호출자는 이 뒤에 arrayBuffer/stream 을 읽고 저장한다. */
  async requestBytes(input: string | URL, options: WebFileOptions = {}): Promise<Response> {
    return this.fileRequest(input, options);
  }
  /** FormData 를 같은 인증·307 경계로 보낸다. 전송 중에는 다운로드의 헤더 제한을 걸지 않는다. */
  async upload(input: string | URL, form: FormData, options: WebFileOptions = {}): Promise<WebEnvelope> {
    try {
      const response = await this.fileRequest(input, { ...options, method: options.method ?? "POST" }, form);
      return await this.readEnvelope(response);
    } catch (error) { throw this.safeError(error); }
  }
  private async prefix(response: Response): Promise<string> {
    const reader = response.clone().body?.getReader();
    if (!reader) return "";
    try {
      const chunk = await reader.read();
      return chunk.value ? new TextDecoder().decode(chunk.value.subarray(0, 4096)) : "";
    } finally {
      // tee 의 다른 쪽(실제 다운로드)이 끝나기를 여기서 기다리지 않는다.
      void reader.cancel().catch(() => undefined);
    }
  }
  private async fileRequest(input: string | URL, options: WebFileOptions, body?: FormData): Promise<Response> {
    let response: Response | undefined;
    try {
      const { searchParams, ...init } = options;
      const url = new URL(String(input), `${this.origin}/`);
      if (searchParams) for (const [key, value] of Object.entries(searchParams)) if (value !== undefined) url.searchParams.set(key, String(value));
      this.assertOrigin(url.href);
      const headers = new Headers(init.headers);
      headers.delete("Authorization");
      headers.set("Cookie", `SESSION=${this.cookie}`);
      if (body) headers.delete("Content-Type");
      const request: RequestInit = { ...init, ...(body && { body }), headers, redirect: "manual" };
      await this.bucket.acquire();
      response = body ? await fetch(url.href, request) : await fetchWithResponseTimeout(url.href, request, "웹 파일 요청");
      this.bucket.sync(parseRateLimitHeaders(response.headers));
      this.assertStatus(response, true);
      if (response.status === 307) {
        const location = response.headers.get("location");
        if (!location || !isTrustedFileHost(location, this.publicApiBaseUrl)) throw new DoorayCliError("파일 리다이렉트 주소가 허용 범위를 벗어났습니다. 쿠키를 보내지 않았습니다.", EXIT_API_ERROR);
        response = body ? await fetch(location, request) : await fetchWithResponseTimeout(location, request, "웹 파일 요청");
        // 두 번째 307 을 포함한 모든 추가 리다이렉트는 거절한다.
        this.assertStatus(response);
      }
      if (!response.ok) { await this.readEnvelope(response); return response; }
      const prefix = await this.prefix(response);
      if (this.isLoginHtml(response, prefix)) throw new DoorayCliError(SESSION_EXPIRED_MESSAGE, EXIT_AUTH_ERROR);
      if (/\bjson\b/i.test(response.headers.get("content-type") ?? "") && !/^attachment(?:;|$)/i.test(response.headers.get("content-disposition") ?? "")) {
        let parsed: unknown;
        try { parsed = parseJsonPreservingLargeIntegers(prefix); } catch {
          // 큰 JSON 첨부를 검사하느라 전부 메모리에 올리지 않는다.
          if (/"isSuccessful"\s*:\s*false/.test(prefix)) throw new DoorayCliError("웹 파일 요청이 실패했습니다.", EXIT_API_ERROR);
        }
        this.throwBodyFailure(parsed, response);
      }
      return response;
    } catch (error) {
      if (response && !response.bodyUsed) await response.body?.cancel().catch(() => undefined);
      throw this.safeError(error);
    }
  }
}
