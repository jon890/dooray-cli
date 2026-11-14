/** stream 영역의 DTO·요청 파라미터와 클라이언트 계약이다. */
import type { DoorayApiHeader } from "@/api/common/types.js";

// ─── Streams ──────────────────────────────────────────

/**
 * `GET common/v1/streams` 원소. `{ type: "post", post: {...} }` 처럼 type 이름의 키에 모델이 들어 있다.
 * 공식 문서의 type 은 project, mail, schedule, event, post, page, pageComment, fileEvent 다.
 * 모델이 type 마다 달라 각 필드를 좁히지 않는다. 표 출력에 쓰는 필드만 아래 헬퍼가 꺼낸다.
 */
export interface StreamItem {
  type?: string;
  [key: string]: unknown;
}

/** 목록 응답은 result 옆에 다음 페이지 커서(`before` 로 넘길 값)를 둔다. */
export interface StreamListResponse {
  header: DoorayApiHeader;
  result: StreamItem[] | null;
  // 문서 예시는 문자열이다. 숫자로 오더라도 19자리라 JSON 파서가 문자열로 보존한다 (ADR-051).
  cursor?: string | number | null;
}

export interface GetStreamsParams {
  size?: number;
  before?: string;
  read?: boolean;
}

export interface StreamClient {
  getStreams(params?: GetStreamsParams): Promise<StreamListResponse>;
}
