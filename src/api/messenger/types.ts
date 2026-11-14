/** messenger 영역의 DTO·요청 파라미터와 클라이언트 계약이다. */
import type { DoorayApiResponse } from "@/api/common/types.js";

// ─── Messenger (ADR-033) ─────────────────────────────────

export interface DirectSendRequest {
  text: string;
  organizationMemberId: string;
}

export interface ChannelLogRequest {
  text: string;
}

export interface ChannelThreadRequest {
  text: string;
  threadText?: string;
}

export interface LogThreadRequest {
  text: string;
}

// direct-send 응답은 id·channelId·senderId·sentAt·seq·text 를 함께 준다 (실측, ADR-051).
// channel logs 응답은 { id, channelId }. 쓰는 필드만 선언해 하나의 타입으로 흡수한다.
// 스레드 생성 응답(threads/create-and-send)에서는 channelId 가 요청에 넣은 대화방 id 가 아니라
// 새로 만들어진 스레드 채널의 id 다 (ADR-052)
export interface MessengerSendResult {
  id: string;
  channelId?: string;
}

export type MessengerSendResponse = DoorayApiResponse<MessengerSendResult>;

// 대화방 참여자. 실측상 `{ type: "member", member: { organizationMemberId } }` 이고 이름은 오지 않는다.
export interface MessengerChannelUser {
  type?: string;
  member?: { organizationMemberId?: string };
}

// direct 방과 일부 private 방은 title 이 빈값이다 (ADR-066).
// `id`·`type` 은 응답에 빠질 수 있어 `messenger channels` 의 표 출력은 둘이 없는 방도 방어한다.
// 필수로 선언한 것은 title 매칭(resolveMessengerChannel)이 두 값이 있다고 보기 때문이다.
// title 매칭(resolveMessengerChannel)은 id·title·type 만 쓰고, 나머지는 `messenger channels` 가 쓴다.
export interface MessengerChannel {
  id: string;
  title: string;
  /** 공식 문서: `direct`(1:1) / `private`(일반 채널) / `me`(나와의 대화) / `bot`(봇이 만든 채널) */
  type: string;
  /** 공식 문서: `system` / `normal` / `archived` / `deleted` */
  status?: string;
  /**
   * 공식 문서의 응답 예시 주석은 「숨기기 여부」 뿐이라 `true`·`false` 중 무엇이 숨김인지 정해지지 않는다.
   * 2026-10-13 숨기기 `true` → `false`, 해제 `false` → `true` 를 양방향으로 실측했다. `false` 가 숨긴 방이다.
   */
  displayed?: boolean;
  capacity?: number;
  createdAt?: string;
  updatedAt?: string;
  archivedAt?: string | null;
  users?: { participants?: MessengerChannelUser[] };
  me?: MessengerChannelUser & { role?: string };
}

export type MessengerChannelListResponse = DoorayApiResponse<MessengerChannel[]>;

// 대화방 로그 발신자. 실측상 `{ type: "member", member: { organizationMemberId } }` 이고
// 이름은 오지 않는다. member 가 아닌 type(봇 등)이 올 수 있어 member 를 optional 로 둔다.
export interface MessengerLogSender {
  type?: string;
  member?: { organizationMemberId?: string };
}

// 로그에 붙은 첨부 파일. type 이 FILE 인 메시지에 오고, REPLY 에도 붙는 경우가 있다 (ADR-072).
export interface MessengerLogFile {
  id: string;
  title?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
}

// 스레드가 달린 메시지에만 온다. channelId 를 logs 에 다시 넣으면 스레드 댓글이 조회된다 (ADR-072).
export interface MessengerLogThread {
  channelId: string;
  /** 실측상 숫자가 아니라 문자열 숫자(`"3"`)로 온다. */
  totalCount?: string;
  lastUpdatedAt?: number;
}

export interface MessengerLog {
  id: string;
  seq?: number;
  sender?: MessengerLogSender;
  sentAt?: string;
  /** FILE 메시지는 파일명과 같은 값이 온다. */
  text?: string;
  type?: string;
  file?: MessengerLogFile;
  thread?: MessengerLogThread;
}

// 목록 응답에 totalCount 는 없고 hasMore 만 온다.
export type MessengerLogListResponse = DoorayApiResponse<MessengerLog[]> & { hasMore?: boolean };

export interface MessengerClient {
  sendDirectMessage(organizationMemberId: string, text: string): Promise<MessengerSendResponse>;
  sendChannelMessage(channelId: string, text: string): Promise<MessengerSendResponse>;
  getChannelLogs(channelId: string, size: number): Promise<MessengerLogListResponse>;
  downloadMessengerFile(channelId: string, fileId: string): Promise<{ buffer: ArrayBuffer; fileName: string }>;
  createChannelThread(channelId: string, text: string, threadText?: string): Promise<MessengerSendResponse>;
  createLogThread(channelId: string, logId: string, text: string): Promise<MessengerSendResponse>;
  getMessengerChannels(): Promise<MessengerChannelListResponse>;
}
