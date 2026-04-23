// ─── Common ─────────────────────────────────────────────

export interface DoorayApiHeader {
  isSuccessful: boolean;
  resultCode: number;
  resultMessage: string;
}

export interface DoorayApiResponse<T> {
  header: DoorayApiHeader;
  result: T;
}

export interface DoorayApiNullableResponse<T> {
  header: DoorayApiHeader;
  result: T | null;
}

export type DoorayApiUnitResponse = DoorayApiNullableResponse<undefined>;

export interface DoorayApiErrorHeader {
  resultMessage: string;
}

export interface DoorayErrorResponse {
  header: DoorayApiErrorHeader;
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

// ─── Post ───────────────────────────────────────────────

export interface ProjectInfo {
  id: string;
  code: string;
}

export interface ParentPost {
  id: string;
  number: number;
  subject: string;
}

export interface Milestone {
  id: string;
  name: string;
}

export interface Tag {
  id: string;
}

export interface Workflow {
  id: string;
  name: string;
}

export interface EmailUser {
  emailAddress: string;
  name: string;
}

export interface Member {
  organizationMemberId: string;
  name?: string;
}

export interface Group {
  projectMemberGroupId: string;
  members: Member[];
}

export interface PostUser {
  type: string;
  member?: Member;
  emailUser?: EmailUser;
  group?: Group;
  workflow?: Workflow;
}

export interface PostUsers {
  from: PostUser;
  to: PostUser[];
  cc: PostUser[];
}

export interface PostBody {
  mimeType: string;
  content: string;
}

export interface PostFile {
  id: string;
  name: string;
  size: number;
}

export interface PostFileDetail {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  createdAt: string;
  creator: {
    type: string;
    member?: { organizationMemberId: string };
    emailUser?: { emailAddress: string; name: string };
  };
}

export type PostFileListResponse = DoorayApiResponse<PostFileDetail[]>;
export type PostFileMetaResponse = DoorayApiResponse<PostFileDetail>;

export interface UploadFileResult {
  id: string;
}

export type UploadFileResponse = DoorayApiResponse<UploadFileResult>;

export interface Post {
  id: string;
  subject: string;
  project: ProjectInfo;
  taskNumber: string;
  closed: boolean;
  createdAt: string;
  dueDate?: string;
  dueDateFlag?: boolean;
  updatedAt: string;
  number: number;
  priority: string;
  parent?: ParentPost;
  workflowClass: string;
  workflow: Workflow;
  milestone?: Milestone;
  tags: Tag[];
  users: PostUsers;
  fileIdList: string[];
}

export interface PostDetail {
  id: string;
  subject: string;
  project: ProjectInfo;
  taskNumber: string;
  closed: boolean;
  createdAt: string;
  dueDate?: string;
  dueDateFlag?: boolean;
  updatedAt: string;
  number: number;
  priority: string;
  parent?: ParentPost;
  workflowClass: string;
  workflow: Workflow;
  milestone?: Milestone;
  tags: Tag[];
  body: PostBody;
  users: PostUsers;
  files: PostFile[];
  fileIdList: string[];
}

export interface CreatePostUsers {
  to: CreatePostUser[];
  cc: CreatePostUser[];
}

export interface CreatePostUser {
  type: string;
  member?: Member;
  emailUser?: EmailUser;
  group?: Group;
}

export interface CreatePostRequest {
  parentPostId?: string;
  users: CreatePostUsers;
  subject: string;
  body: PostBody;
  dueDate?: string;
  dueDateFlag?: boolean;
  milestoneId?: string;
  tagIds?: string[];
  priority?: string;
}

export interface UpdatePostRequest {
  users: CreatePostUsers;
  subject: string;
  body: PostBody;
  version?: number;
  dueDate?: string;
  dueDateFlag?: boolean;
  milestoneId?: string;
  tagIds?: string[];
  priority?: string;
}

export interface SetWorkflowRequest {
  workflowId: string;
}

export interface SetParentPostRequest {
  parentPostId: string;
}

export interface CreatePostResponse {
  id: string;
}

export interface PostListResponse {
  header: DoorayApiHeader;
  result: Post[];
  totalCount: number;
}

export type PostDetailResponse = DoorayApiResponse<PostDetail>;

export type CreatePostApiResponse = DoorayApiResponse<CreatePostResponse>;

export type UpdatePostResponse = DoorayApiUnitResponse;

// ─── Post Comment ───────────────────────────────────────

export interface PostCommentBody {
  mimeType: string;
  content: string;
}

export interface PostCommentFile {
  id: string;
  name: string;
  size: number;
}

export interface PostInfo {
  id: string;
}

export interface MailUsers {
  from?: EmailUser;
  to: EmailUser[];
  cc: EmailUser[];
}

export interface PostComment {
  id: string;
  post: PostInfo;
  type: string;
  subtype: string;
  createdAt: string;
  modifiedAt?: string;
  creator: PostUser;
  mailUsers?: MailUsers;
  body: PostCommentBody;
  files?: PostCommentFile[];
}

export interface CreateCommentRequest {
  body: PostCommentBody;
}

export interface CreateCommentResponse {
  id: string;
}

export interface UpdateCommentRequest {
  body: PostCommentBody;
}

export interface PostCommentListResponse {
  header: DoorayApiHeader;
  result: PostComment[];
  totalCount: number;
}

export type PostCommentDetailResponse = DoorayApiResponse<PostComment>;

export type CreateCommentApiResponse = DoorayApiResponse<CreateCommentResponse>;

export type UpdateCommentResponse = DoorayApiUnitResponse;

export type DeleteCommentResponse = DoorayApiUnitResponse;

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

export interface ProjectMemberListResponse {
  header: DoorayApiHeader;
  result: ProjectMember[];
  totalCount?: number;
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

// ─── Wiki ───────────────────────────────────────────────

export interface WikiHome {
  pageId: string;
}

export interface WikiProject {
  id: string;
}

export interface Wiki {
  id: string;
  project: WikiProject;
  name: string;
  type: string;
  scope: string;
  home: WikiHome;
}

export type WikiListResponse = DoorayApiResponse<Wiki[]>;

export interface Creator {
  type: string;
  member: Member;
}

export interface WikiPage {
  id: string;
  wikiId: string;
  version: number;
  root: boolean;
  creator: Creator;
  subject: string;
}

export type WikiPagesResponse = DoorayApiResponse<WikiPage[]>;

export interface WikiPageBody {
  mimeType: string;
  content?: string;
}

export interface WikiPageDetail {
  id: string;
  wikiId: string;
  version: number;
  root: boolean;
  creator: Creator;
  subject: string;
  body?: WikiPageBody;
  createdAt?: string;
  updatedAt?: string;
  parentPageId?: string;
}

export type WikiPageResponse = DoorayApiResponse<WikiPageDetail>;

export interface WikiReferrer {
  type: string;
  member: Member;
}

export interface CreateWikiPageRequest {
  subject: string;
  body: WikiPageBody;
  parentPageId: string;
  attachFileIds?: string[];
  referrers?: WikiReferrer[];
}

export interface UpdateWikiPageRequest {
  subject?: string;
  body?: WikiPageBody;
  referrers?: WikiReferrer[];
}

export interface UpdateWikiPageTitleRequest {
  subject: string;
}

export interface UpdateWikiPageContentRequest {
  body: WikiPageBody;
}

export interface CreateWikiPageResult {
  id: string;
  wikiId: string;
  parentPageId?: string;
  version: number;
}

export type CreateWikiPageResponse = DoorayApiResponse<CreateWikiPageResult>;
