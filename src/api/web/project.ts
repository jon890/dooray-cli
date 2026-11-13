/** 프로젝트 웹 경로와 공식 응답 변환. 태그 쓰기는 웹의 배열·tag-prefixes 규약을 따른다. */
import type { DoorayClient } from "../dooray-client.js";
import type { PostUser, Tag, TemplateDetail } from "../types.js";
import { apiPath } from "../api-path.js";
import { count, date, identifier, invalidResponse, member, pick, project, referenceMap, row, rows, text, type Row } from "./convert.js";
import type { WebContext } from "./context.js";
import type { WebEnvelope } from "../web-http.js";

type ProjectMethods = Pick<DoorayClient, "getProjects" | "getProjectMembers" | "getProjectWorkflows" | "getProjectTags" | "createProjectTag" | "updateProjectTagGroup" | "getProjectMilestones" | "getProjectMemberGroups" | "getProjectTemplates" | "getProjectTemplateDetail">;

function paged(response: WebEnvelope): { content: Row[]; totalCount: number; references: unknown } {
  const result = row(response.result);
  return { content: rows(result.contents), totalCount: count(result.totalCount), references: result.references };
}

function tag(source: Row, references: unknown): Tag {
  const id = identifier(source.id);
  let tagGroup: Tag["tagGroup"] = null;
  if (source.tagPrefixId !== undefined && source.tagPrefixId !== null) {
    const group = row(referenceMap(references, "tagPrefixMap")[identifier(source.tagPrefixId)]);
    if (typeof group.mandatory !== "boolean" || typeof group.selectOne !== "boolean") return invalidResponse();
    tagGroup = { id: identifier(group.id), name: text(group.name), mandatory: group.mandatory, selectOne: group.selectOne };
  }
  return { id, name: text(source.name), color: text(source.color), tagGroup };
}

function user(source: Row): PostUser {
  const type = text(source.type);
  if (type === "member") {
    const m = row(source.member);
    return { type, member: { organizationMemberId: identifier(m.organizationMemberId ?? m.id) } };
  }
  if (type.toLowerCase() === "emailuser") {
    const email = row(source.emailUser ?? source.emailuser);
    return { type, [source.emailuser ? "emailuser" : "emailUser"]: { name: text(email.name), emailAddress: text(email.emailAddress) } };
  }
  if (type === "group") {
    const group = row(source.group);
    return { type, group: {
      projectMemberGroupId: identifier(group.projectMemberGroupId),
      members: rows(group.memberList ?? group.members).map((m) => ({ organizationMemberId: identifier(m.organizationMemberId), ...pick(m, ["name"]) })),
    } };
  }
  // 공식 템플릿의 사용자 형태에 대응하지 않는 값은 조용히 버리지 않는다.
  return invalidResponse();
}

async function template(source: Row, refs: unknown, context: WebContext, projectId: string, detail: boolean): Promise<TemplateDetail> {
  const id = identifier(source.id);
  const projectRef = referenceMap(refs, "projectMap")[projectId];
  const p = projectRef ? project(projectRef) : await context.project(projectId);
  context.projects.set(p.id, p);
  const result = { ...pick(source, ["subject", "dueDateFlag", "isDefault", "priority"]), id, templateName: text(source.templateName), project: { id: p.id, code: p.code } } as TemplateDetail;
  if (source.dueDate !== undefined) Object.assign(result, { dueDate: date(source.dueDate) });
  if (source.users !== undefined && source.users !== null) {
    const u = row(source.users);
    Object.assign(result, { users: { to: rows(u.to).map(user), cc: rows(u.cc).map(user) } });
  }
  if (source.milestoneId !== undefined && source.milestoneId !== null) {
    const m = row(referenceMap(refs, "milestoneMap")[identifier(source.milestoneId)]);
    result.milestone = { id: identifier(m.id), name: text(m.name) };
  }
  if (source.tagIdList !== undefined && source.tagIdList !== null) {
    if (!Array.isArray(source.tagIdList)) return invalidResponse();
    result.tags = source.tagIdList.map((id) => ({ id: identifier(id) }));
  }
  if (detail) for (const key of ["body", "guide"] as const) {
    if (source[key] === undefined || source[key] === null) continue;
    const body = row(source[key]);
    Object.assign(result, { [key]: { mimeType: text(body.mimeType), content: text(body.content) } });
  }
  return result;
}

export function createProjectMethods(context: WebContext): ProjectMethods {
  const http = context.http;
  return {
    async getProjects(params) {
      const response = await http.request("wapi/project/v1/projects", { searchParams: { member: "me", ...params } });
      const result = rows(response.result).map(project);
      for (const p of result) context.projects.set(p.id, p);
      return { header: response.header, result, totalCount: count(response.totalCount) };
    },
    async getProjectMembers(projectId, params) {
      const response = await http.request(apiPath`wapi/task/v1/projects/!${projectId}/members`, { searchParams: { member: "me", ...params } });
      const result = rows(response.result).map((source) => {
        const m = member(source.member);
        if (!context.members.has(m.id)) context.members.set(m.id, m);
        return { organizationMemberId: m.id, ...pick(source, ["role"]) };
      });
      return { header: response.header, result, totalCount: count(response.totalCount) };
    },
    async getProjectWorkflows(projectId) {
      const response = await http.request(apiPath`v2/wapi/projects/!${projectId}/workflows`);
      const result = rows(row(response.result).contents).map((source) => ({
        ...pick(source, ["order", "names"]), id: identifier(source.id), name: text(source.name), class: text(source.class),
      }));
      return { header: response.header, result, totalCount: result.length };
    },
    async getProjectTags(projectId, params) {
      const response = await http.request(apiPath`v2/wapi/projects/!${projectId}/tags`, { searchParams: params });
      const page = paged(response);
      return { header: response.header, result: page.content.map((source) => tag(source, page.references)), totalCount: page.totalCount };
    },
    async createProjectTag(projectId, body) {
      const response = await http.request(apiPath`v2/wapi/projects/!${projectId}/tags`, { method: "POST", json: [body] });
      const created = rows(response.result);
      if (created.length !== 1) return invalidResponse();
      return { header: response.header, result: { id: identifier(created[0].id) } };
    },
    async updateProjectTagGroup(projectId, tagGroupId, body) {
      const response = await http.request(apiPath`v2/wapi/projects/!${projectId}/tag-prefixes/${tagGroupId}`, { method: "PUT", json: body });
      if (response.result !== null) return invalidResponse();
      return { header: response.header, result: null };
    },
    async getProjectMilestones(projectId, params) {
      const response = await http.request(apiPath`v2/wapi/projects/!${projectId}/milestones`, { searchParams: params });
      const page = paged(response);
      const result = page.content.map((source) => {
        const m = { ...pick(source, ["status"]), id: identifier(source.id), name: text(source.name) };
        for (const key of ["startedAt", "endedAt", "closedAt", "createdAt", "updatedAt"]) {
          if (source[key] !== undefined) Object.assign(m, { [key]: date(source[key]) });
        }
        return m;
      });
      return { header: response.header, result, totalCount: page.totalCount };
    },
    async getProjectMemberGroups(projectId, params) {
      const response = await http.request(apiPath`v2/wapi/projects/!${projectId}/project-member-groups`, { searchParams: params });
      const page = paged(response);
      const p = page.content.length ? await context.project(projectId) : undefined;
      const result = page.content.map((source) => ({
        id: identifier(source.id), ...pick(source, ["code"]), project: { id: p!.id, code: p!.code },
        createdAt: date(source.createdAt) ?? invalidResponse(), updatedAt: date(source.updatedAt) ?? invalidResponse(),
      }));
      return { header: response.header, result, totalCount: page.totalCount };
    },
    async getProjectTemplates(projectId, params) {
      const response = await http.request(apiPath`v2/wapi/projects/!${projectId}/templates`, { searchParams: params });
      const page = paged(response);
      const result = await Promise.all(page.content.map((source) => template(source, page.references, context, projectId, false)));
      return { header: response.header, result, totalCount: page.totalCount };
    },
    async getProjectTemplateDetail(projectId, templateId, interpolation = true) {
      const response = await http.request(apiPath`v2/wapi/projects/!${projectId}/templates/${templateId}`, { searchParams: { interpolation } });
      const result = row(response.result);
      return { header: response.header, result: await template(row(result.content), result.references, context, projectId, true) };
    },
  };
}
