import type { PublicHttp } from "@/api/public/http.js";
import type { MemberClient, GetMembersParams, MeResponse, MemberDetailResponse, MemberSearchResponse, ProjectMemberListResponse, SearchMembersParams } from "./types.js";
import { apiPath } from "@/api/api-path.js";
import { DoorayCliError } from "@/utils/errors.js";
import { toDoorayCliError } from "@/api/public/http.js";

/** member 영역의 공개 API 구현. 공용 HTTP 는 PublicHttp 가 맡는다. */
export function createMemberPublic(http: PublicHttp): MemberClient {
  return {
    async getMe(): Promise<MeResponse> {
      try {
        return await http.api
          .get("common/v1/members/me")
          .json<MeResponse>();
      } catch (e) {
        throw await toDoorayCliError(e);
      }
    },

    async getProjectMembers(projectId: string, params?: GetMembersParams): Promise<ProjectMemberListResponse> {
      try {
        return await http.api
          .get(apiPath`project/v1/projects/${projectId}/members`, {
            searchParams: {
              member: "me",
              ...(params?.page != null && { page: params.page }),
              ...(params?.size != null && { size: params.size }),
            },
          })
          .json<ProjectMemberListResponse>();
      } catch (e) {
        throw await toDoorayCliError(e);
      }
    },

    async getMemberDetail(memberId: string): Promise<MemberDetailResponse> {
      try {
        return await http.api
          .get(apiPath`common/v1/members/${memberId}`)
          .json<MemberDetailResponse>();
      } catch (e) {
        throw await toDoorayCliError(e);
      }
    },

    async searchMembers(params: SearchMembersParams): Promise<MemberSearchResponse> {
      try {
        return await http.api
          .get("common/v1/members", {
            searchParams: {
              ...(params.name && { name: params.name }),
              ...(params.externalEmailAddresses && { externalEmailAddresses: params.externalEmailAddresses }),
              ...(params.userCode && { userCode: params.userCode }),
              ...(params.userCodeExact && { userCodeExact: params.userCodeExact }),
              ...(params.idProviderUserId && { idProviderUserId: params.idProviderUserId }),
              ...(params.page != null && { page: params.page }),
              ...(params.size != null && { size: params.size }),
            },
          })
          .json<MemberSearchResponse>();
      } catch (e) {
        throw await toDoorayCliError(e);
      }
    },
  };
}
