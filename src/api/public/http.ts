/**
 * 공개 API 구현이 영역마다 나누어 쓰는 공용 부분이다.
 * ky 인스턴스, 토큰 버킷, 오류 변환, 파일 서버 요청과 다운로드 리다이렉트를 맡는다.
 * 영역 구현(`api/<영역>/public.ts`)은 PublicHttp 하나를 받아 쓴다 (ADR-082).
 */
import ky, { type KyInstance, HTTPError } from "ky";
import { DoorayCliError } from "@/utils/errors.js";
import { normalizeDoorayMessage } from "@/utils/dooray-message.js";
import { EXIT_API_ERROR, EXIT_AUTH_ERROR, EXIT_RATE_LIMITED } from "@/utils/exit-codes.js";
import { describeOrigin, fetchWithResponseTimeout, isTrustedFileHost } from "@/api/file-redirect.js";
import { createTokenBucket, parseRateLimitHeaders } from "@/api/rate-limiter.js";
import { parseJsonPreservingLargeIntegers } from "@/api/json-large-integer.js";
import type { DoorayErrorResponse } from "@/api/common/types.js";

/** status 를 직접 보는 파일 경로의 종료 코드. 429 는 ky 오류 변환과 같이 호출 한도 초과로 나눈다. */
export function fileStatusExitCode(status: number): number {
  return status === 429 ? EXIT_RATE_LIMITED : EXIT_API_ERROR;
}

export async function toDoorayCliError(error: unknown): Promise<never> {
  if (error instanceof HTTPError) {
    const status = error.response.status;
    if (status === 429) {
      // ky 가 재시도를 다 쓴 뒤다. 본문 메시지보다 「잠시 뒤 다시」 가 부르는 쪽에 필요한 정보다.
      throw new DoorayCliError(
        "API 호출 한도를 넘었습니다 (429). 잠시 뒤 다시 실행하세요.",
        EXIT_RATE_LIMITED,
      );
    }
    const exitCode = status === 401 || status === 403 ? EXIT_AUTH_ERROR : EXIT_API_ERROR;
    try {
      const body = (await error.response.json()) as DoorayErrorResponse;
      // NOTE: form-encoding 관례로 `+`를 공백으로 치환한다.
      // Dooray resultMessage에 의도된 `+`가 포함된 경우 공백으로 바뀌는 부작용이
      // 있으나, 실측된 메시지는 대부분 한국어 설명문이라 수용 가능한 트레이드오프.
      throw new DoorayCliError(
        `API 호출 실패: ${normalizeDoorayMessage(body.header.resultMessage)}`,
        exitCode,
      );
    } catch (e) {
      if (e instanceof DoorayCliError) throw e;
      throw new DoorayCliError(
        `API 호출 실패 (${status}): ${error.message}`,
        exitCode,
      );
    }
  }
  throw error;
}

function createApi(authHeader: string, baseUrl: string): KyInstance {
  const bucket = createTokenBucket();
  return ky.create({
    prefix: baseUrl,
    headers: {
      Authorization: authHeader,
    },
    // 19자리 식별자를 Number 로 읽으면 정밀도가 깨진다. 손실 나는 리터럴만 문자열로 보존한다 (ADR-051).
    parseJson: (text) => parseJsonPreservingLargeIntegers(text),
    // 429 는 재시도할 가치가 있지만, 동시 요청이 한꺼번에 재시도하면 같은 결과가 반복된다.
    // jitter 로 재시도 시점을 흩고, 아래 훅이 재시도분도 버킷을 거치게 한다.
    retry: {
      limit: 3,
      statusCodes: [408, 413, 429, 500, 502, 503, 504],
      backoffLimit: 8000,
      jitter: true,
    },
    hooks: {
      // 훅 순서는 실측했다 — beforeRequest → afterResponse → beforeRetry → afterResponse.
      // beforeRequest 는 첫 요청에만 돌고 재시도에는 돌지 않으므로,
      // beforeRetry 에서도 토큰을 받아야 재시도가 버킷을 우회하지 않는다.
      beforeRequest: [
        async () => {
          await bucket.acquire();
        },
      ],
      beforeRetry: [
        async ({ error }) => {
          if (error instanceof HTTPError && error.response.status === 429) {
            bucket.drain();
          }
          await bucket.acquire();
        },
      ],
      afterResponse: [
        ({ response }) => {
          bucket.sync(parseRateLimitHeaders(response.headers));
        },
      ],
    },
  });
}

export class PublicHttp {
  readonly api: KyInstance;
  readonly authHeader: string;
  readonly baseUrl: string;

  /** api 는 테스트가 ky 를 바꿔 끼울 때만 준다. 주지 않으면 토큰 버킷과 재시도를 갖춘 인스턴스를 만든다. */
  constructor(apiKey: string, baseUrl: string, api?: KyInstance) {
    this.authHeader = `dooray-api ${apiKey}`;
    this.baseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
    this.api = api ?? createApi(this.authHeader, baseUrl);
  }

  /** 원시 fetch 에 쓰는 절대 주소. 경로는 `apiPath` 로 만든 값을 받는다 (ADR-075). */
  url(path: string): string {
    return this.baseUrl + path;
  }

  /**
   * 첨부 API 의 307 이 가리키는 파일 서버에 인증 헤더를 실어 요청한다 (ADR-015, ADR-074).
   * API 주소와 같은 도메인의 https 주소가 아니면 인증 헤더를 보내지 않고 멈춘다. 파일 서버가 또 redirect 하면 따라가지 않는다.
   * 응답 시간 제한은 본문이 없는 다운로드에만 건다. 업로드는 본문 전송이 끝나야 헤더가 와서 제한이 곧 전송 시간 제한이 된다.
   * notFoundMessage 는 파일 서버의 404 가 본문 없이 와서 호출자가 고칠 곳을 알려야 할 때 준다 (ADR-072).
   */
  async requestFileServer(
    location: string | null,
    label: string,
    init: RequestInit = {},
    notFoundMessage?: string,
  ): Promise<Response> {
    if (!location) {
      throw new DoorayCliError(`${label} 리다이렉트 URL을 받지 못했습니다.`, EXIT_API_ERROR);
    }
    if (!isTrustedFileHost(location, this.baseUrl)) {
      throw new DoorayCliError(
        `${label} 리다이렉트가 예상하지 못한 주소(${describeOrigin(location)})를 가리켜 인증 정보를 보내지 않았습니다.`,
        EXIT_API_ERROR,
      );
    }
    const request: RequestInit = { ...init, headers: { Authorization: this.authHeader }, redirect: "manual" };
    const res = init.body == null ? await fetchWithResponseTimeout(location, request, label) : await fetch(location, request);
    if (res.status >= 300 && res.status < 400) {
      throw new DoorayCliError(`${label} 실패: 파일 서버가 다른 주소로 다시 보냈습니다 (${res.status}).`, EXIT_API_ERROR);
    }
    if (res.status === 404 && notFoundMessage) {
      throw new DoorayCliError(notFoundMessage, EXIT_API_ERROR);
    }
    if (!res.ok) {
      throw new DoorayCliError(`${label} 실패 (${res.status})`, fileStatusExitCode(res.status));
    }
    return res;
  }

  /** 다운로드 경로는 항상 307 이다 (ADR-015). 다른 status 면 파일 서버를 부르지 않고 실패한다. */
  async followDownloadRedirect(res: Response, label: string, notFoundMessage?: string): Promise<Response> {
    if (res.status !== 307) {
      throw new DoorayCliError(
        `${label} 실패 (예상 status 307, 실제 ${res.status})`,
        fileStatusExitCode(res.status),
      );
    }
    return this.requestFileServer(res.headers.get("location"), label, {}, notFoundMessage);
  }
}
