/** member 영역의 DTO·요청 파라미터와 클라이언트 계약이다. */
import type { Member } from "@/api/common/types.js";
import type { DoorayApiHeader, DoorayApiResponse } from "@/api/common/types.js";

export interface GetMembersParams {
  page?: number;
  size?: number;
}

export interface SearchMembersParams {
  name?: string;
  externalEmailAddresses?: string;
  userCode?: string;
  userCodeExact?: string;
  idProviderUserId?: string;
  page?: number;
  size?: number;
}




// ─── Project Member ─────────────────────────────────────

export interface ProjectMember {
  organizationMemberId: string;
  role?: string;
}

export interface MemberDetail {
  id: string;
  name: string;
  userCode?: string;
  externalEmailAddress?: string;
  englishName?: string;
  nickname?: string;
}

export type MemberDetailResponse = DoorayApiResponse<MemberDetail>;

export interface MemberSearchResponse {
  header: DoorayApiHeader;
  result: MemberDetail[];
  totalCount: number;
}

export interface MeDetail extends MemberDetail {
  defaultOrganization: { id: string };
  idProviderType?: string;
  idProviderUserId?: string;
  locale?: string;
  timezoneName?: string;
  nativeName?: string;
  displayMemberId?: string;
}

export type MeResponse = DoorayApiResponse<MeDetail>;

export interface ProjectMemberListResponse {
  header: DoorayApiHeader;
  result: ProjectMember[];
  totalCount?: number;
}

/**
 * 소속 부서. 공식 문서는 부서가 없으면 `id` 와 `name` 이 각각 null 이라고 적는다.
 * 실측으로는 부서 이름이 있는데도 `id` 가 null 로 왔다. `id` 로 부서 유무를 판단하지 않는다.
 */
export interface BusyHoursDepartment {
  id: string | null;
  name: string | null;
}

/** `member get` 응답의 `defaultOrganization` 은 id 뿐이고, 이름은 이 응답에만 온다. */
export interface BusyHoursOrganization {
  id: string | null;
  name: string | null;
}

/** `member get --with-org` 이 응답에 덧붙이는 소속 정보. 바쁨 시간 조회의 `member` 에서 꺼낸다. */
export interface MemberOrganization {
  defaultOrganization: BusyHoursOrganization | null;
  primaryDepartment: BusyHoursDepartment | null;
  positionName: string | null;
}

export interface MemberClient {
  /** 웹 목록에 이미 있는 이름만 조회한다. 공개 API 구현에서는 생략한다. */
  getMemberNameFromList?(memberId: string): string | undefined;
  getMe(): Promise<MeResponse>;
  getProjectMembers(projectId: string, params?: GetMembersParams): Promise<ProjectMemberListResponse>;
  getMemberDetail(memberId: string): Promise<MemberDetailResponse>;
  searchMembers(params: SearchMembersParams): Promise<MemberSearchResponse>;
}

export type { EmailUser, Member, Group } from "@/api/common/types.js";
