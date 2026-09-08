import type { ChannelThreadRequest, LogThreadRequest } from "./types.js";

export interface ThreadRequest {
  path: string;
  json: ChannelThreadRequest | LogThreadRequest;
}

/**
 * 스레드 생성 요청의 경로와 body 를 만든다 (ADR-052).
 *
 * - `logId` 가 있으면 `logs/{logId}/threads/create-and-send` 를 호출하고 body 는 `{ text }` 뿐이다.
 *   `threadText` 는 이 경로에서 받지 않으므로 무시한다.
 * - `logId` 가 없으면 `threads/create-and-send` 를 호출하고, `threadText` 가 주어졌을 때만
 *   그 키를 body 에 넣는다. 빈 문자열을 그대로 보내면 빈 메시지가 스레드에 생기기 때문이다.
 */
export function buildThreadRequest(
  channelId: string,
  text: string,
  opts?: { logId?: string; threadText?: string },
): ThreadRequest {
  if (opts?.logId) {
    const json: LogThreadRequest = { text };
    return {
      path: `messenger/v1/channels/${channelId}/logs/${opts.logId}/threads/create-and-send`,
      json,
    };
  }

  const json: ChannelThreadRequest = { text };
  if (opts?.threadText) {
    json.threadText = opts.threadText;
  }
  return {
    path: `messenger/v1/channels/${channelId}/threads/create-and-send`,
    json,
  };
}
