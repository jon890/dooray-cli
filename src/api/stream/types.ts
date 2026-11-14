/** stream 영역의 공개 메서드 계약. DTO 는 api/types.ts 가 소유한다. */
import type { StreamListResponse, GetStreamsParams } from "../types.js";

export interface StreamClient {
  getStreams(params?: GetStreamsParams): Promise<StreamListResponse>;
}
