/**
 * 메신저 웹 경로(messenger 의 `v1`·`v3` api 경로)를 호출하고 공개 API 응답 모양으로 바꾼다.
 * 읽기(대화방 목록·메시지 목록)만 실측했다. 보내기·스레드·파일 받기는 웹 경로를 실측하지 못해 지원하지 않는다.
 * 경로와 변환 근거는 docs/api/web-endpoints/messenger.md 가 소유한다.
 */
import type { MessengerClient } from "./types.js";
import type { MessengerChannel, MessengerLog } from "../types.js";
import { apiPath } from "../api-path.js";
import { date, identifier, invalidResponse, pick, row, rows, text, type Row } from "../web/convert.js";
import type { WebContext } from "../web/context.js";
import { DoorayCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";

const unsupported = async (): Promise<never> => {
  throw new DoorayCliError("웹 방식에서는 지원하지 않습니다. auth-mode 를 api-key 로 바꾸세요.", EXIT_PARAM_ERROR);
};

function channel(source: Row): MessengerChannel {
  const memberIds = Array.isArray(source.members) ? source.members.map(identifier) : [];
  const out: Row = {
    id: identifier(source.channelId),
    title: typeof source.title === "string" ? source.title : "",
    type: text(source.type),
    organization: { id: identifier(source.orgId) },
    users: { participants: memberIds.map((organizationMemberId) => ({ type: "member", member: { organizationMemberId } })) },
    ...pick(source, ["capacity", "displayed"]),
    ...(typeof source.flag === "string" && { status: source.flag }),
  };
  if (source.memberId !== undefined && source.memberId !== null) {
    out.me = { type: "member", member: { organizationMemberId: identifier(source.memberId) }, ...pick(source, ["role"]) };
  }
  if (source.createdAt !== undefined && source.createdAt !== null) out.createdAt = date(source.createdAt);
  if (source.updatedAt !== undefined && source.updatedAt !== null) out.updatedAt = date(source.updatedAt);
  return out as unknown as MessengerChannel;
}

function log(source: Row): MessengerLog {
  const out: Row = { id: identifier(source.id), ...pick(source, ["seq", "text"]) };
  if (source.senderId !== undefined && source.senderId !== null) out.sender = { type: "member", member: { organizationMemberId: identifier(source.senderId) } };
  if (source.sentAt !== undefined && source.sentAt !== null) out.sentAt = date(source.sentAt);
  if (source.file) {
    const file = row(source.file);
    out.file = { id: identifier(file.id), ...pick(file, ["title", "fileName", "fileSize", "mimeType"]) };
    out.type = "FILE";
  } else if (source.originalLogId) out.type = "REPLY";
  return out as unknown as MessengerLog;
}

export function createMessengerWeb(context: WebContext): MessengerClient {
  const http = context.http;
  return {
    async getMessengerChannels() {
      const response = await http.request("messenger/v3/api/members/me/favorites", { searchParams: { responseType: "all", flags: "system,normal,archived" } });
      const content = row(row(response.result).content);
      if (!Array.isArray(content.channels)) return invalidResponse();
      const result = rows(content.channels).map(channel);
      return { header: response.header, result, totalCount: result.length } as Awaited<ReturnType<MessengerClient["getMessengerChannels"]>>;
    },
    async getChannelLogs(channelId, size) {
      const response = await http.request(apiPath`messenger/v1/api/channel/${channelId}/logs`, { searchParams: { limit: size, setLastChannel: false } });
      const content = row(row(response.result).content);
      if (!Array.isArray(content.logs)) return invalidResponse();
      // 웹은 오래된 것이 앞이다. 공개 API 와 같이 최신이 앞이 되게 뒤집는다.
      const result = rows(content.logs).map(log).reverse();
      return { header: response.header, result, ...(typeof content.hasPrev === "boolean" && { hasMore: content.hasPrev }) };
    },
    sendDirectMessage: unsupported,
    sendChannelMessage: unsupported,
    createChannelThread: unsupported,
    createLogThread: unsupported,
    downloadMessengerFile: unsupported,
  };
}
