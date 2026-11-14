/** project 영역의 DTO·요청 파라미터와 클라이언트 계약이다. */
import type { Workflow } from "@/api/common/types.js";
import type { DoorayApiHeader, DoorayApiResponse, DoorayApiUnitResponse } from "@/api/common/types.js";
import type { PostUsers, PostBody } from "@/api/common/types.js";

export interface GetProjectsParams {
  page?: number;
  size?: number;
  type?: string;
  scope?: string;
  state?: string;
}

// ─── Project ────────────────────────────────────────────

export interface ProjectOrganization {
  id: string | null;
}

export interface ProjectDrive {
  id: string | null;
}

export interface ProjectWiki {
  id: string | null;
}

export interface Project {
  id: string;
  code: string;
  description?: string;
  state?: string;
  scope?: string;
  type?: string;
  organization?: ProjectOrganization;
  drive?: ProjectDrive;
  wiki?: ProjectWiki;
}

export interface ProjectListResponse {
  header: DoorayApiHeader;
  result: Project[];
  totalCount: number;
}

// ─── 프로젝트 참조와 분류 ─────────────────────────────────

export interface ProjectInfo {
  id: string;
  code: string;
}

export interface TagGroup {
  id: string;
  name: string;
  mandatory: boolean;
  selectOne: boolean;
}

// 기존 Tag 확장 — 신규 필드는 모두 optional.
// PostDetailItem.tags 응답에는 id 외 필드가 없을 수 있어 런타임 undefined 위험 방지.
export interface Tag {
  id: string;
  name?: string;
  color?: string;
  tagGroup?: TagGroup | null;
}

export interface Milestone {
  id: string;
  name: string;
}

export interface TagListResponse {
  header: DoorayApiHeader;
  result: Tag[];
  totalCount: number;
}

export interface CreateTagRequest {
  name: string;
  color: string;
}

export interface CreateTagApiResponse {
  header: DoorayApiHeader;
  result: { id: string };
}

export interface UpdateTagGroupRequest {
  mandatory: boolean;
  selectOne: boolean;
}

// PUT tag-groups 응답의 result 는 null 이라 unit 응답을 재사용한다 (UpdatePostResponse 와 같은 방식)
export type UpdateTagGroupResponse = DoorayApiUnitResponse;

export interface MilestoneListResponse {
  header: DoorayApiHeader;
  result: Milestone[];
  totalCount: number;
}

// ─── Project Member Group ───────────────────────────────

export interface MemberGroup {
  id: string;
  code?: string;  // optional — 실제 API 응답에서 누락 케이스 존재 (ADR-028)
  project: ProjectInfo;
  createdAt: string;
  updatedAt: string;
}

export interface MemberGroupListResponse {
  header: DoorayApiHeader;
  // Dooray API 가 nested array (`[[g1, g2]]`) 로 반환 — 평면 / 중첩 둘 다 허용 (ADR-028).
  // 호출자 (`fetchAllMemberGroups`) 가 `.flat()` 로 정규화 — `.flat()` 시그니처가 union 의
  // 양쪽 case 를 흡수하므로 추가 단언 불필요.
  result: MemberGroup[] | MemberGroup[][];
  totalCount: number;
}

// ─── Project Workflow ───────────────────────────────────

export interface ProjectWorkflow {
  id: string;
  name: string;
  class: string;
  order?: number;
}

export interface ProjectWorkflowListResponse {
  header: DoorayApiHeader;
  result: ProjectWorkflow[];
}

// ─── Template ────────────────────────────────────────────

// 목록용 (body 미포함)
export interface TemplateMeta {
  id: string;
  templateName: string;
  project: { id: string; code: string };
}

// 단건용 (body/users/tags 포함, interpolation=true 시 매크로 치환됨)
export interface TemplateDetail extends TemplateMeta {
  subject?: string;
  body?: PostBody;
  users?: PostUsers;
  tags?: Tag[];
  priority?: string;
  milestone?: Milestone;
}

export type TemplateListResponse = DoorayApiResponse<TemplateMeta[]> & { totalCount: number };

export type TemplateDetailResponse = DoorayApiResponse<TemplateDetail>;

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

export type { Workflow } from "@/api/common/types.js";
