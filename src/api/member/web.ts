/** 멤버 웹 경로를 호출하고 공개 멤버 응답 모양으로 바꾼다. */
import type { MemberClient } from "./types.js";
import { apiPath } from "../api-path.js";
import { count, invalidResponse, member, pick, row, rows } from "../web/convert.js";
import type { WebContext } from "../web/context.js";

export function createMemberWeb(context: WebContext): MemberClient {
  const http = context.http;
  return {
    getMemberNameFromList(memberId) { return context.memberNames.get(memberId); },
    async getProjectMembers(projectId, params) {
      const response = await http.request(apiPath`wapi/task/v1/projects/!${projectId}/members`, { searchParams: { member: "me", ...params } });
      const result = rows(response.result).map((source) => {
        const m = member(source.member);
        context.memberNames.set(m.id, m.name);
        return { organizationMemberId: m.id, ...pick(source, ["role"]) };
      });
      return { header: response.header, result, totalCount: count(response.totalCount) };
    },
    async getMe() {
      const response = await http.request("v2/wapi/members/me");
      const result = member(row(response.result).content);
      if (!result.defaultOrganization) return invalidResponse();
      return { header: response.header, result: { ...result, defaultOrganization: result.defaultOrganization } };
    },
    async getMemberDetail(memberId) {
      const cached = context.memberDetails.get(memberId);
      if (cached) return { header: { isSuccessful: true, resultCode: 0, resultMessage: "" }, result: cached };
      const response = await http.request(apiPath`v2/wapi/members/${memberId}`);
      const result = member(row(response.result).content);
      context.memberDetails.set(memberId, result);
      return { header: response.header, result };
    },
    async searchMembers(params) {
      const searchParams = Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined));
      const response = await http.request("v2/wapi/members", { searchParams });
      const result = row(response.result);
      return { header: response.header, result: rows(result.contents).map((value) => member(value, false)), totalCount: count(result.totalCount) };
    },
  };
}
