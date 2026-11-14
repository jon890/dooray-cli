/** messenger 영역의 공개 메서드 계약. DTO 는 api/types.ts 가 소유한다. */
import type { MessengerSendResponse, MessengerChannelListResponse, MessengerLogListResponse } from "../types.js";

export interface MessengerClient {
  sendDirectMessage(organizationMemberId: string, text: string): Promise<MessengerSendResponse>;
  sendChannelMessage(channelId: string, text: string): Promise<MessengerSendResponse>;
  getChannelLogs(channelId: string, size: number): Promise<MessengerLogListResponse>;
  downloadMessengerFile(channelId: string, fileId: string): Promise<{ buffer: ArrayBuffer; fileName: string }>;
  createChannelThread(channelId: string, text: string, threadText?: string): Promise<MessengerSendResponse>;
  createLogThread(channelId: string, logId: string, text: string): Promise<MessengerSendResponse>;
  getMessengerChannels(): Promise<MessengerChannelListResponse>;
}
