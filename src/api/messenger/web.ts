/**
 * 메신저 웹 경로(messenger 의 `v1`·`v3` api 경로)를 호출하고 공개 API 응답 모양으로 바꾼다.
 * 읽기, 나에게 보내기, 스레드 만들기, 파일 받기를 실측했다. 다른 사람의 대화방에 보내는 경로는 같은 요청이지만 실측 장소 규칙상 확인하지 못했다.
 * 경로와 변환 근거는 docs/api/web-endpoints/messenger.md 가 소유한다.
 */
import type { MessengerClient } from "./types.js";
import type { MessengerChannel, MessengerLog } from "../types.js";
import { apiPath } from "../api-path.js";
import { date, identifier, invalidResponse, pick, row, rows, text, type Row } from "../web/convert.js";
import { randomUUID } from "node:crypto";
import { parseContentDispositionFileName, fallbackFileName } from "../../utils/content-disposition.js";
import type { WebContext } from "../web/context.js";
import { DoorayCliError } from "../../utils/errors.js";
import { EXIT_API_ERROR, EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";

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
  if (source.thread) {
    const thread = row(source.thread);
    out.thread = { channelId: identifier(thread.channelId), ...pick(thread, ["totalCount", "lastUpdatedAt"]) };
  }
  if (source.file) {
    const file = row(source.file);
    out.file = { id: identifier(file.id), ...pick(file, ["title", "fileName", "fileSize", "mimeType"]) };
    out.type = "FILE";
  } else if (source.originalLogId) out.type = "REPLY";
  return out as unknown as MessengerLog;
}

const ALREADY_EXISTS = /CHANNEL_ALREADY_EXISTS/;
/** 글타래 목록을 한 번에 받는 개수와 훑는 최대 페이지 수. 1000 개를 받아도 한 번에 끝나는 것을 실측했다(내 글타래 289개). */
const THREAD_PAGE_SIZE = 1000;
const THREAD_MAX_PAGES = 20;

export function createMessengerWeb(context: WebContext): MessengerClient {
  const http = context.http;
  let myId: Promise<string> | undefined;
  const memberId = () => (myId ??= http.request("messenger/v1/api/members/me", { searchParams: { v: "0.2.0" } }).then((response) => identifier(row(row(response.result).content).id)));

  /** 채널(또는 스레드 채널)에 메시지를 보낸다. token 은 클라이언트가 만드는 UUID 다. */
  async function send(channelId: string, body: string) {
    const response = await http.request(apiPath`messenger/v1/api/channelLogs/${channelId}`, { method: "POST", json: { text: body, token: randomUUID() } });
    const content = row(row(response.result).content);
    return { header: response.header, id: identifier(content.id), channelId: identifier(content.channelId) };
  }

  /**
   * 내 글타래 목록에서 부모 로그의 스레드 채널을 찾는다. 목록은 최신순이 아니라 페이지마다 훑어야 한다.
   * 한 번에 THREAD_PAGE_SIZE 개를 받고, 그보다 적게 오면 끝이다. 상한은 THREAD_MAX_PAGES 번이다.
   */
  async function findThread(channelId: string, logId: string): Promise<string | undefined> {
    for (let page = 0; page < THREAD_MAX_PAGES; page += 1) {
      const response = await http.request("messenger/v2/api/thread-channels", { searchParams: { size: THREAD_PAGE_SIZE, page } });
      const contents = rows(row(response.result).contents);
      const hit = contents.find((item) => item.parentChannelLogId !== undefined && identifier(item.parentChannelLogId) === logId && identifier(item.parentChannelId) === channelId);
      if (hit) return identifier(hit.channelId);
      if (contents.length < THREAD_PAGE_SIZE) return undefined;
    }
    return undefined;
  }

  /** 로그에서 스레드를 연다. 이미 있으면 그 스레드 채널을 돌려준다. */
  async function openThread(channelId: string, logId: string): Promise<string> {
    try {
      const me = await memberId();
      const response = await http.request("messenger/v1/api/thread-channels", {
        method: "POST", json: { parentChannelId: channelId, parentChannelLogId: logId, capacity: 1, type: "thread", members: [me], isPublic: false },
      });
      return identifier(row(row(response.result).content).channelId);
    } catch (error) {
      if (!(error instanceof DoorayCliError) || !ALREADY_EXISTS.test(error.message)) throw error;
      // 이미 스레드가 있는 로그다. 내 글타래 목록에서 부모 로그 id 로 그 채널을 찾는다.
      const found = await findThread(channelId, logId);
      if (!found) throw new DoorayCliError("스레드가 이미 있지만 내 글타래 목록에서 그 채널을 찾지 못했습니다. 부모 메시지의 thread.channelId 를 channel-send --channel 에 직접 주세요.", EXIT_API_ERROR);
      return found;
    }
  }

  const client: MessengerClient = {
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
    async sendDirectMessage(organizationMemberId, body) {
      // 웹에는 상대 id 로 1:1 방에 바로 보내는 경로가 없다. 내 대화방이나 이미 있는 1:1 방을 목록에서 찾아 보낸다.
      const channels = (await client.getMessengerChannels()).result;
      const me = await memberId();
      const target = organizationMemberId === me
        ? channels.find((c) => c.type === "me")
        : channels.find((c) => c.type === "direct" && c.users?.participants?.some((p) => p.member?.organizationMemberId === organizationMemberId));
      if (!target) throw new DoorayCliError("웹 방식에서는 대화방이 아직 없는 상대에게 보낼 수 없습니다. 먼저 메신저에서 1:1 대화를 시작하세요.", EXIT_PARAM_ERROR);
      const sent = await send(target.id, body);
      return { header: sent.header, result: { id: sent.id, channelId: sent.channelId } };
    },
    async sendChannelMessage(channelId, body) {
      const sent = await send(channelId, body);
      return { header: sent.header, result: { id: sent.id, channelId: sent.channelId } };
    },
    async createChannelThread(channelId, body, threadText) {
      const parent = await send(channelId, body);
      const threadChannelId = await openThread(channelId, parent.id);
      const first = threadText ? await send(threadChannelId, threadText) : parent;
      return { header: first.header, result: { id: first.id, channelId: threadChannelId } };
    },
    async createLogThread(channelId, logId, body) {
      const threadChannelId = await openThread(channelId, logId);
      const sent = await send(threadChannelId, body);
      return { header: sent.header, result: { id: sent.id, channelId: threadChannelId } };
    },
    async downloadMessengerFile(channelId, fileId) {
      const response = await http.requestBytes(apiPath`messenger/v2/api/channel/${channelId}/file/${fileId}`);
      const disposition = response.headers.get("content-disposition");
      // 없는 파일은 200 에 본문과 content-disposition 이 모두 없다.
      if (!disposition) {
        await response.body?.cancel().catch(() => undefined);
        throw new DoorayCliError("메신저 파일을 찾지 못했습니다. 대화방 id 와 파일 id 조합을 확인하세요.", EXIT_API_ERROR);
      }
      const fileName = parseContentDispositionFileName(disposition) ?? fallbackFileName(fileId, undefined, disposition);
      return { buffer: await response.arrayBuffer(), fileName };
    },
  };
  return client;
}
