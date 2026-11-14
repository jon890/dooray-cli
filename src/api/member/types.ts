/** member 영역의 공개 메서드 계약. DTO 는 api/types.ts 가 소유한다. */
import type { ProjectMemberListResponse, MemberDetailResponse, MemberSearchResponse, MeResponse } from "../types.js";
import type { GetMembersParams, SearchMembersParams } from "../types.js";

export interface MemberClient {
  /** 웹 목록에 이미 있는 이름만 조회한다. 공개 API 구현에서는 생략한다. */
  getMemberNameFromList?(memberId: string): string | undefined;
  getMe(): Promise<MeResponse>;
  getProjectMembers(projectId: string, params?: GetMembersParams): Promise<ProjectMemberListResponse>;
  getMemberDetail(memberId: string): Promise<MemberDetailResponse>;
  searchMembers(params: SearchMembersParams): Promise<MemberSearchResponse>;
}
