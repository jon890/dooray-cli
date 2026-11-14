/** project 영역의 공개 메서드 계약. DTO 는 api/types.ts 가 소유한다. */
import type { ProjectListResponse, ProjectWorkflowListResponse, TagListResponse, CreateTagRequest, CreateTagApiResponse, UpdateTagGroupRequest, UpdateTagGroupResponse, MilestoneListResponse, MemberGroupListResponse, TemplateListResponse, TemplateDetailResponse } from "../types.js";
import type { GetProjectsParams } from "../types.js";

export interface ProjectClient {
  getProjects(params?: GetProjectsParams): Promise<ProjectListResponse>;
  getProjectWorkflows(projectId: string): Promise<ProjectWorkflowListResponse>;
  getProjectTags(projectId: string, params?: { page?: number; size?: number }): Promise<TagListResponse>;
  createProjectTag(projectId: string, body: CreateTagRequest): Promise<CreateTagApiResponse>;
  updateProjectTagGroup(projectId: string, tagGroupId: string, body: UpdateTagGroupRequest): Promise<UpdateTagGroupResponse>;
  getProjectMemberGroups(projectId: string, params?: { page?: number; size?: number }): Promise<MemberGroupListResponse>;
  getProjectMilestones(projectId: string, params?: { page?: number; size?: number }): Promise<MilestoneListResponse>;
  getProjectTemplates(projectId: string, params?: { page?: number; size?: number }): Promise<TemplateListResponse>;
  getProjectTemplateDetail(projectId: string, templateId: string, interpolation?: boolean): Promise<TemplateDetailResponse>;
}
