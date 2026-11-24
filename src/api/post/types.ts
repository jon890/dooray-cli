/** post 영역의 DTO·요청 파라미터와 클라이언트 계약이다. */
import type { PostUser, PostUsers, PostBody } from "@/api/common/types.js";
import type { DoorayApiHeader, DoorayApiResponse, DoorayApiUnitResponse } from "@/api/common/types.js";
import type { ProjectInfo, Tag, Milestone } from "@/api/project/types.js";
import type { Workflow } from "@/api/common/types.js";
import type { EmailUser, Member, Group } from "@/api/common/types.js";

export interface GetPostsParams {
  page?: number;
  size?: number;
  fromMemberIds?: string[];
  toMemberIds?: string[];
  ccMemberIds?: string[];
  tagIds?: string[];
  parentPostId?: string;
  postNumber?: string;
  postWorkflowClasses?: string[];
  postWorkflowIds?: string[];
  milestoneIds?: string[];
  subjects?: string;
  createdAt?: string;
  updatedAt?: string;
  dueAt?: string;
  order?: string;
}

export interface GetPostCommentsParams {
  page?: number;
  size?: number;
  order?: "createdAt" | "-createdAt";
}

export interface ParentPost {
  id: string;
  number: number;
  subject: string;
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
  name: string | null;
  size: number | null;
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

export type SetPostParentResponse = DoorayApiUnitResponse | {
  header: DoorayApiHeader;
  result: { post: { id: string }; project: { id: string } };
};

/** 공개 API 클라이언트에서 댓글 리액션 호출을 거절하는 문구. */
export const REACTION_WEB_ONLY_MESSAGE =
  "댓글 리액션은 웹 API 에서만 지원합니다. dooray config set session-cookie - 로 SESSION 쿠키를 저장하세요.";

export interface PostClient {
  getPosts(projectId: string, params?: GetPostsParams): Promise<PostListResponse>;
  getPost(projectId: string, postId: string): Promise<PostDetailResponse>;
  getPostStandalone(postId: string): Promise<PostDetailResponse>;
  createPost(projectId: string, body: CreatePostRequest): Promise<CreatePostApiResponse>;
  updatePost(projectId: string, postId: string, body: UpdatePostRequest): Promise<UpdatePostResponse>;
  setPostDone(projectId: string, postId: string): Promise<DoorayApiUnitResponse>;
  setPostWorkflow(projectId: string, postId: string, workflowId: string): Promise<DoorayApiUnitResponse>;
  setPostParent(projectId: string, postId: string, parentPostId: string): Promise<SetPostParentResponse>;
  getPostComments(projectId: string, postId: string, params?: GetPostCommentsParams): Promise<PostCommentListResponse>;
  getPostComment(projectId: string, postId: string, logId: string): Promise<PostCommentDetailResponse>;
  createPostComment(projectId: string, postId: string, body: CreateCommentRequest): Promise<CreateCommentApiResponse>;
  updatePostComment(projectId: string, postId: string, logId: string, body: UpdateCommentRequest, options?: { removeFileId?: string }): Promise<UpdateCommentResponse>;
  deletePostComment(projectId: string, postId: string, logId: string): Promise<DeleteCommentResponse>;
  /** 댓글에 리액션을 단다. 공식 API 에 없어 웹 방식만 구현한다. `emoji` 는 웹이 쓰는 이모지 이름이다(예: `+1`). */
  addPostCommentReaction(projectId: string, postId: string, logId: string, emoji: string): Promise<DoorayApiUnitResponse>;
  /** 내가 단 리액션을 뗀다. 공식 API 에 없어 웹 방식만 구현한다. */
  removePostCommentReaction(projectId: string, postId: string, logId: string, emoji: string): Promise<DoorayApiUnitResponse>;
  getPostFiles(projectId: string, postId: string): Promise<PostFileListResponse>;
  getPostFileMeta(projectId: string, postId: string, fileId: string): Promise<PostFileMetaResponse>;
  downloadPostFile(projectId: string, postId: string, fileId: string, knownName?: string): Promise<{ buffer: ArrayBuffer; fileName: string }>;
  uploadPostFile(projectId: string, postId: string, filePath: string): Promise<UploadFileResponse>;
  deletePostFile(projectId: string, postId: string, fileId: string): Promise<DoorayApiUnitResponse>;
}

export type { PostUser, PostUsers, PostBody } from "@/api/common/types.js";
