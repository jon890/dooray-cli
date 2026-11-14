import type { PublicHttp } from "@/api/public/http.js";
import type { MessengerClient, ChannelLogRequest, DirectSendRequest, MessengerChannelListResponse, MessengerLogListResponse, MessengerSendResponse } from "./types.js";
import { apiPath } from "@/api/api-path.js";
import { buildThreadRequest } from "@/api/messenger-thread-request.js";
import { DoorayCliError } from "@/utils/errors.js";
import { fallbackFileName, parseContentDispositionFileName } from "@/utils/content-disposition.js";
import { toDoorayCliError } from "@/api/public/http.js";

/** messenger 영역의 공개 API 구현. 공용 HTTP 는 PublicHttp 가 맡는다. */
export function createMessengerPublic(http: PublicHttp): MessengerClient {
  return {
    async sendDirectMessage(
      organizationMemberId: string,
      text: string,
    ): Promise<MessengerSendResponse> {
      try {
        return await http.api
          .post("messenger/v1/channels/direct-send", {
            json: { text, organizationMemberId } satisfies DirectSendRequest,
          })
          .json<MessengerSendResponse>();
      } catch (e) {
        throw await toDoorayCliError(e);
      }
    },

    async sendChannelMessage(channelId: string, text: string): Promise<MessengerSendResponse> {
      try {
        return await http.api
          .post(apiPath`messenger/v1/channels/${channelId}/logs`, {
            json: { text } satisfies ChannelLogRequest,
          })
          .json<MessengerSendResponse>();
      } catch (e) {
        throw await toDoorayCliError(e);
      }
    },

    /**
     * 대화방 메시지 목록. seq 내림차순(최신이 앞)으로 온다.
     * 페이징 수단이 없어 최근 size 건만 가져올 수 있고 그 이전으로는 갈 수 없다 (size 상한 1000).
     */
    async getChannelLogs(channelId: string, size: number): Promise<MessengerLogListResponse> {
      try {
        return await http.api
          .get(apiPath`messenger/v1/channels/${channelId}/logs`, {
            searchParams: { size },
          })
          .json<MessengerLogListResponse>();
      } catch (e) {
        throw await toDoorayCliError(e);
      }
    },

    /**
     * 대화방 메시지에 첨부된 파일. 공식 문서에 없는 경로다 (ADR-072).
     * api 서버는 채널·파일 조합을 검증하지 않고 항상 307 을 주며, 틀린 조합은 file-api 가 본문 없는 404 로 답한다.
     * 이름을 대신 찾을 목록 조회가 없어 헤더로 못 풀면 `<fileId>.<ext>` 로 저장한다 (ADR-067).
     */
    async downloadMessengerFile(
      channelId: string,
      fileId: string,
    ): Promise<{ buffer: ArrayBuffer; fileName: string }> {
      try {
        const res = await http.api
          .get(apiPath`messenger/v1/channels/${channelId}/files/${fileId}`, {
            redirect: "manual",
            throwHttpErrors: false,
          });
        const fileRes = await http.followDownloadRedirect(
          res,
          "메신저 파일 다운로드",
          "메신저 파일을 찾지 못했습니다 (404). 대화방 id 와 파일 id 조합을 확인하세요. " +
            "파일 id 는 그 파일이 올라온 대화방의 logs 참조 칸에서 얻습니다.",
        );

        const disposition = fileRes.headers.get("content-disposition");
        const fileName =
          parseContentDispositionFileName(disposition) ?? fallbackFileName(fileId, undefined, disposition);

        const buffer = await fileRes.arrayBuffer();
        return { buffer, fileName };
      } catch (e) {
        if (e instanceof DoorayCliError) throw e;
        throw await toDoorayCliError(e);
      }
    },

    async createChannelThread(
      channelId: string,
      text: string,
      threadText?: string,
    ): Promise<MessengerSendResponse> {
      try {
        const req = buildThreadRequest(channelId, text, { threadText });
        return await http.api.post(req.path, { json: req.json }).json<MessengerSendResponse>();
      } catch (e) {
        throw await toDoorayCliError(e);
      }
    },

    async createLogThread(
      channelId: string,
      logId: string,
      text: string,
    ): Promise<MessengerSendResponse> {
      try {
        const req = buildThreadRequest(channelId, text, { logId });
        return await http.api.post(req.path, { json: req.json }).json<MessengerSendResponse>();
      } catch (e) {
        throw await toDoorayCliError(e);
      }
    },

    async getMessengerChannels(): Promise<MessengerChannelListResponse> {
      try {
        return await http.api
          .get("messenger/v1/channels")
          .json<MessengerChannelListResponse>();
      } catch (e) {
        throw await toDoorayCliError(e);
      }
    },
  };
}
