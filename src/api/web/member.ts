/** 멤버 웹 경로를 호출하고 공개 멤버 응답 모양으로 바꾼다. */
import type { DoorayClient } from "../dooray-client.js";
import { apiPath } from "../api-path.js";
import { count, invalidResponse, member, row, rows } from "./convert.js";
import type { WebContext } from "./context.js";

export function createMemberMethods(context: WebContext): Pick<DoorayClient, "getMe" | "getMemberDetail" | "searchMembers"> {
  const http = context.http;
  return {
    async getMe() {
      const response = await http.request("v2/wapi/members/me");
      const result = member(row(response.result).content);
      if (!result.defaultOrganization) return invalidResponse();
      return { header: response.header, result: { ...result, defaultOrganization: result.defaultOrganization } };
    },
    async getMemberDetail(memberId) {
      const cached = context.members.get(memberId);
      if (cached) return { header: { isSuccessful: true, resultCode: 0, resultMessage: "" }, result: cached };
      const response = await http.request(apiPath`v2/wapi/members/${memberId}`);
      const result = member(row(response.result).content);
      context.members.set(memberId, result);
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
