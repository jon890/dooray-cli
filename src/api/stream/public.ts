import type { PublicHttp } from "@/api/public/http.js";
import type { StreamClient, GetStreamsParams, StreamListResponse } from "./types.js";
import { DoorayCliError } from "@/utils/errors.js";
import { toDoorayCliError } from "@/api/public/http.js";

/** stream 영역의 공개 API 구현. 공용 HTTP 는 PublicHttp 가 맡는다. */
export function createStreamPublic(http: PublicHttp): StreamClient {
  return {
    async getStreams(params?: GetStreamsParams): Promise<StreamListResponse> {
      try {
        return await http.api
          .get("common/v1/streams", {
            searchParams: {
              ...(params?.size != null && { size: params.size }),
              ...(params?.before && { before: params.before }),
              ...(params?.read != null && { read: params.read }),
            },
          })
          .json<StreamListResponse>();
      } catch (e) {
        throw await toDoorayCliError(e);
      }
    },
  };
}
