/** member 영역의 공개 메서드 계약. DTO 는 api/types.ts 가 소유한다. */
import type { ProjectMemberListResponse, MemberDetailResponse, MemberSearchResponse, MeResponse } from "../types.js";
import type { GetMembersParams, SearchMembersParams } from "../client.js";

export interface MemberClient {
  getMe(): Promise<MeResponse>;
  getProjectMembers(projectId: string, params?: GetMembersParams): Promise<ProjectMemberListResponse>;
  getMemberDetail(memberId: string): Promise<MemberDetailResponse>;
  searchMembers(params: SearchMembersParams): Promise<MemberSearchResponse>;
}
