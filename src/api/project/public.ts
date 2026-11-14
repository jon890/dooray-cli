import type { PublicHttp } from "@/api/public/http.js";
import type { ProjectClient, CreateTagApiResponse, CreateTagRequest, GetProjectsParams, MemberGroupListResponse, MilestoneListResponse, ProjectListResponse, ProjectWorkflowListResponse, TagListResponse, TemplateDetailResponse, TemplateListResponse, UpdateTagGroupRequest, UpdateTagGroupResponse } from "./types.js";
import { apiPath } from "@/api/api-path.js";
import { DoorayCliError } from "@/utils/errors.js";
import { toDoorayCliError } from "@/api/public/http.js";

/** project 영역의 공개 API 구현. 공용 HTTP 는 PublicHttp 가 맡는다. */
export function createProjectPublic(http: PublicHttp): ProjectClient {
  return {
    async getProjects(params?: GetProjectsParams): Promise<ProjectListResponse> {
      try {
        return await http.api
          .get("project/v1/projects", {
            searchParams: {
              member: "me",
              ...(params?.page != null && { page: params.page }),
              ...(params?.size != null && { size: params.size }),
              ...(params?.type && { type: params.type }),
              ...(params?.scope && { scope: params.scope }),
              ...(params?.state && { state: params.state }),
            },
          })
          .json<ProjectListResponse>();
      } catch (e) {
        throw await toDoorayCliError(e);
      }
    },

    async getProjectWorkflows(projectId: string): Promise<ProjectWorkflowListResponse> {
      try {
        return await http.api
          .get(apiPath`project/v1/projects/${projectId}/workflows`)
          .json<ProjectWorkflowListResponse>();
      } catch (e) {
        throw await toDoorayCliError(e);
      }
    },

    async getProjectTags(
      projectId: string,
      params?: { page?: number; size?: number },
    ): Promise<TagListResponse> {
      try {
        return await http.api
          .get(apiPath`project/v1/projects/${projectId}/tags`, {
            searchParams: {
              ...(params?.page != null && { page: params.page }),
              ...(params?.size != null && { size: params.size }),
            },
          })
          .json<TagListResponse>();
      } catch (e) {
        throw await toDoorayCliError(e);
      }
    },

    async createProjectTag(projectId: string, body: CreateTagRequest): Promise<CreateTagApiResponse> {
      try {
        return await http.api
          .post(apiPath`project/v1/projects/${projectId}/tags`, { json: body })
          .json<CreateTagApiResponse>();
      } catch (e) {
        throw await toDoorayCliError(e);
      }
    },

    async updateProjectTagGroup(
      projectId: string,
      tagGroupId: string,
      body: UpdateTagGroupRequest,
    ): Promise<UpdateTagGroupResponse> {
      try {
        return await http.api
          .put(apiPath`project/v1/projects/${projectId}/tag-groups/${tagGroupId}`, { json: body })
          .json<UpdateTagGroupResponse>();
      } catch (e) {
        throw await toDoorayCliError(e);
      }
    },

    async getProjectMemberGroups(
      projectId: string,
      params?: { page?: number; size?: number },
    ): Promise<MemberGroupListResponse> {
      try {
        return await http.api
          .get(apiPath`project/v1/projects/${projectId}/member-groups`, {
            searchParams: {
              ...(params?.page != null && { page: params.page }),
              ...(params?.size != null && { size: params.size }),
            },
          })
          .json<MemberGroupListResponse>();
      } catch (e) {
        throw await toDoorayCliError(e);
      }
    },

    async getProjectMilestones(
      projectId: string,
      params?: { page?: number; size?: number },
    ): Promise<MilestoneListResponse> {
      try {
        return await http.api
          .get(apiPath`project/v1/projects/${projectId}/milestones`, {
            searchParams: {
              ...(params?.page != null && { page: params.page }),
              ...(params?.size != null && { size: params.size }),
            },
          })
          .json<MilestoneListResponse>();
      } catch (e) {
        throw await toDoorayCliError(e);
      }
    },

    async getProjectTemplates(
      projectId: string,
      params?: { page?: number; size?: number },
    ): Promise<TemplateListResponse> {
      try {
        return await http.api
          .get(apiPath`project/v1/projects/${projectId}/templates`, {
            searchParams: {
              ...(params?.page != null && { page: params.page }),
              ...(params?.size != null && { size: params.size }),
            },
          })
          .json<TemplateListResponse>();
      } catch (e) {
        throw await toDoorayCliError(e);
      }
    },

    async getProjectTemplateDetail(
      projectId: string,
      templateId: string,
      interpolation: boolean = true,
    ): Promise<TemplateDetailResponse> {
      try {
        return await http.api
          .get(apiPath`project/v1/projects/${projectId}/templates/${templateId}`, {
            searchParams: { interpolation: String(interpolation) },
          })
          .json<TemplateDetailResponse>();
      } catch (e) {
        throw await toDoorayCliError(e);
      }
    },
  };
}
