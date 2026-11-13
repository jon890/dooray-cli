/** post 영역의 공개 메서드 계약. DTO 는 api/types.ts 가 소유한다. */
import type { PostListResponse, PostDetailResponse, CreatePostApiResponse, CreatePostRequest, UpdatePostRequest, UpdatePostResponse, PostCommentListResponse, PostCommentDetailResponse, CreateCommentApiResponse, CreateCommentRequest, UpdateCommentRequest, UpdateCommentResponse, DeleteCommentResponse, DoorayApiUnitResponse, PostFileListResponse, PostFileMetaResponse, UploadFileResponse } from "../types.js";
import type { GetPostsParams, GetPostCommentsParams } from "../client.js";

export interface PostClient {
  getPosts(projectId: string, params?: GetPostsParams): Promise<PostListResponse>;
  getPost(projectId: string, postId: string): Promise<PostDetailResponse>;
  getPostStandalone(postId: string): Promise<PostDetailResponse>;
  createPost(projectId: string, body: CreatePostRequest): Promise<CreatePostApiResponse>;
  updatePost(projectId: string, postId: string, body: UpdatePostRequest): Promise<UpdatePostResponse>;
  setPostDone(projectId: string, postId: string): Promise<DoorayApiUnitResponse>;
  setPostWorkflow(projectId: string, postId: string, workflowId: string): Promise<DoorayApiUnitResponse>;
  setPostParent(projectId: string, postId: string, parentPostId: string): Promise<DoorayApiUnitResponse>;
  getPostComments(projectId: string, postId: string, params?: GetPostCommentsParams): Promise<PostCommentListResponse>;
  getPostComment(projectId: string, postId: string, logId: string): Promise<PostCommentDetailResponse>;
  createPostComment(projectId: string, postId: string, body: CreateCommentRequest): Promise<CreateCommentApiResponse>;
  updatePostComment(projectId: string, postId: string, logId: string, body: UpdateCommentRequest): Promise<UpdateCommentResponse>;
  deletePostComment(projectId: string, postId: string, logId: string): Promise<DeleteCommentResponse>;
  getPostFiles(projectId: string, postId: string): Promise<PostFileListResponse>;
  getPostFileMeta(projectId: string, postId: string, fileId: string): Promise<PostFileMetaResponse>;
  downloadPostFile(projectId: string, postId: string, fileId: string, knownName?: string): Promise<{ buffer: ArrayBuffer; fileName: string }>;
  uploadPostFile(projectId: string, postId: string, filePath: string): Promise<UploadFileResponse>;
  deletePostFile(projectId: string, postId: string, fileId: string): Promise<DoorayApiUnitResponse>;
}
