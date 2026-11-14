import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { PublicHttp } from "@/api/public/http.js";
import type { PostClient, CreateCommentApiResponse, CreateCommentRequest, CreatePostApiResponse, CreatePostRequest, DeleteCommentResponse, GetPostCommentsParams, GetPostsParams, PostCommentDetailResponse, PostCommentListResponse, PostDetailResponse, PostFileListResponse, PostFileMetaResponse, PostListResponse, SetParentPostRequest, SetWorkflowRequest, UpdateCommentRequest, UpdateCommentResponse, UpdatePostRequest, UpdatePostResponse, UploadFileResponse } from "./types.js";
import type { DoorayApiUnitResponse } from "@/api/common/types.js";
import { apiPath } from "@/api/api-path.js";
import { DoorayCliError } from "@/utils/errors.js";
import { fallbackFileName, parseContentDispositionFileName } from "@/utils/content-disposition.js";
import { fileStatusExitCode, toDoorayCliError } from "@/api/public/http.js";

function joinIds(ids: string[] | undefined): string | undefined {
  return ids && ids.length > 0 ? ids.join(",") : undefined;
}

/** post 영역의 공개 API 구현. 공용 HTTP 는 PublicHttp 가 맡는다. */
export function createPostPublic(http: PublicHttp): PostClient {
  const client: PostClient = {
      async getPosts(projectId: string, params?: GetPostsParams): Promise<PostListResponse> {
        try {
          return await http.api
            .get(apiPath`project/v1/projects/${projectId}/posts`, {
              searchParams: {
                ...(params?.page != null && { page: params.page }),
                ...(params?.size != null && { size: params.size }),
                ...(joinIds(params?.fromMemberIds) && { fromMemberIds: joinIds(params?.fromMemberIds) }),
                ...(joinIds(params?.toMemberIds) && { toMemberIds: joinIds(params?.toMemberIds) }),
                ...(joinIds(params?.ccMemberIds) && { ccMemberIds: joinIds(params?.ccMemberIds) }),
                ...(joinIds(params?.tagIds) && { tagIds: joinIds(params?.tagIds) }),
                ...(params?.parentPostId && { parentPostId: params.parentPostId }),
                ...(params?.postNumber && { postNumber: params.postNumber }),
                ...(joinIds(params?.postWorkflowClasses) && { postWorkflowClasses: joinIds(params?.postWorkflowClasses) }),
                ...(joinIds(params?.postWorkflowIds) && { postWorkflowIds: joinIds(params?.postWorkflowIds) }),
                ...(joinIds(params?.milestoneIds) && { milestoneIds: joinIds(params?.milestoneIds) }),
                ...(params?.subjects && { subjects: params.subjects }),
                ...(params?.createdAt && { createdAt: params.createdAt }),
                ...(params?.updatedAt && { updatedAt: params.updatedAt }),
                ...(params?.dueAt && { dueAt: params.dueAt }),
                ...(params?.order && { order: params.order }),
              },
            })
            .json<PostListResponse>();
        } catch (e) {
          throw await toDoorayCliError(e);
        }
      },

      async getPost(projectId: string, postId: string): Promise<PostDetailResponse> {
        try {
          return await http.api
            .get(apiPath`project/v1/projects/${projectId}/posts/${postId}`)
            .json<PostDetailResponse>();
        } catch (e) {
          throw await toDoorayCliError(e);
        }
      },

      async getPostStandalone(postId: string): Promise<PostDetailResponse> {
        try {
          return await http.api
            .get(apiPath`project/v1/posts/${postId}`)
            .json<PostDetailResponse>();
        } catch (e) {
          throw await toDoorayCliError(e);
        }
      },

      async createPost(projectId: string, body: CreatePostRequest): Promise<CreatePostApiResponse> {
        try {
          return await http.api
            .post(apiPath`project/v1/projects/${projectId}/posts`, { json: body })
            .json<CreatePostApiResponse>();
        } catch (e) {
          throw await toDoorayCliError(e);
        }
      },

      async updatePost(projectId: string, postId: string, body: UpdatePostRequest): Promise<UpdatePostResponse> {
        try {
          return await http.api
            .put(apiPath`project/v1/projects/${projectId}/posts/${postId}`, { json: body })
            .json<UpdatePostResponse>();
        } catch (e) {
          throw await toDoorayCliError(e);
        }
      },

      async setPostDone(projectId: string, postId: string): Promise<DoorayApiUnitResponse> {
        try {
          return await http.api
            .post(apiPath`project/v1/projects/${projectId}/posts/${postId}/set-done`)
            .json<DoorayApiUnitResponse>();
        } catch (e) {
          throw await toDoorayCliError(e);
        }
      },

      async setPostWorkflow(projectId: string, postId: string, workflowId: string): Promise<DoorayApiUnitResponse> {
        try {
          return await http.api
            .post(apiPath`project/v1/projects/${projectId}/posts/${postId}/set-workflow`, {
              json: { workflowId } satisfies SetWorkflowRequest,
            })
            .json<DoorayApiUnitResponse>();
        } catch (e) {
          throw await toDoorayCliError(e);
        }
      },

      async setPostParent(projectId: string, postId: string, parentPostId: string): Promise<DoorayApiUnitResponse> {
        try {
          return await http.api
            .post(apiPath`project/v1/projects/${projectId}/posts/${postId}/set-parent-post`, {
              json: { parentPostId } satisfies SetParentPostRequest,
            })
            .json<DoorayApiUnitResponse>();
        } catch (e) {
          throw await toDoorayCliError(e);
        }
      },

      async getPostComments(projectId: string, postId: string, params?: GetPostCommentsParams): Promise<PostCommentListResponse> {
        try {
          return await http.api
            .get(apiPath`project/v1/projects/${projectId}/posts/${postId}/logs`, {
              searchParams: {
                ...(params?.page != null && { page: params.page }),
                ...(params?.size != null && { size: params.size }),
                ...(params?.order && { order: params.order }),
              },
            })
            .json<PostCommentListResponse>();
        } catch (e) {
          throw await toDoorayCliError(e);
        }
      },

      async getPostComment(
        projectId: string,
        postId: string,
        logId: string,
      ): Promise<PostCommentDetailResponse> {
        try {
          return await http.api
            .get(apiPath`project/v1/projects/${projectId}/posts/${postId}/logs/${logId}`)
            .json<PostCommentDetailResponse>();
        } catch (e) {
          throw await toDoorayCliError(e);
        }
      },

      async createPostComment(projectId: string, postId: string, body: CreateCommentRequest): Promise<CreateCommentApiResponse> {
        try {
          return await http.api
            .post(apiPath`project/v1/projects/${projectId}/posts/${postId}/logs`, { json: body })
            .json<CreateCommentApiResponse>();
        } catch (e) {
          throw await toDoorayCliError(e);
        }
      },

      async updatePostComment(projectId: string, postId: string, logId: string, body: UpdateCommentRequest): Promise<UpdateCommentResponse> {
        try {
          return await http.api
            .put(apiPath`project/v1/projects/${projectId}/posts/${postId}/logs/${logId}`, { json: body })
            .json<UpdateCommentResponse>();
        } catch (e) {
          throw await toDoorayCliError(e);
        }
      },

      async deletePostComment(projectId: string, postId: string, logId: string): Promise<DeleteCommentResponse> {
        try {
          return await http.api
            .delete(apiPath`project/v1/projects/${projectId}/posts/${postId}/logs/${logId}`)
            .json<DeleteCommentResponse>();
        } catch (e) {
          throw await toDoorayCliError(e);
        }
      },

      async getPostFiles(projectId: string, postId: string): Promise<PostFileListResponse> {
        try {
          return await http.api
            .get(apiPath`project/v1/projects/${projectId}/posts/${postId}/files`)
            .json<PostFileListResponse>();
        } catch (e) {
          throw await toDoorayCliError(e);
        }
      },

      async getPostFileMeta(projectId: string, postId: string, fileId: string): Promise<PostFileMetaResponse> {
        try {
          return await http.api
            .get(apiPath`project/v1/projects/${projectId}/posts/${postId}/files/${fileId}`, {
              searchParams: { media: "meta" },
            })
            .json<PostFileMetaResponse>();
        } catch (e) {
          throw await toDoorayCliError(e);
        }
      },

      // fileName 은 ADR-067 규칙으로 푼 안전한 저장 이름이다. knownName 은 호출자가 이미 가진 목록의 name 이다.
      async downloadPostFile(
        projectId: string,
        postId: string,
        fileId: string,
        knownName?: string,
      ): Promise<{ buffer: ArrayBuffer; fileName: string }> {
        try {
          const res = await http.api
            .get(apiPath`project/v1/projects/${projectId}/posts/${postId}/files/${fileId}`, {
              searchParams: { media: "raw" },
              redirect: "manual",
              throwHttpErrors: false,
            });
          const fileRes = await http.followDownloadRedirect(res, "파일 다운로드");

          const disposition = fileRes.headers.get("content-disposition");
          let fileName = parseContentDispositionFileName(disposition);
          if (!fileName) {
            let listName = knownName;
            if (!listName) {
              // 디코딩에 실패했을 때만 목록을 조회한다 (호출 수 증가를 실패 경로로 한정)
              const list = await client.getPostFiles(projectId, postId).catch(() => null);
              listName = list?.result.find((f) => f.id === fileId)?.name;
            }
            fileName = fallbackFileName(fileId, listName, disposition);
          }

          const buffer = await fileRes.arrayBuffer();
          return { buffer, fileName };
        } catch (e) {
          if (e instanceof DoorayCliError) throw e;
          throw await toDoorayCliError(e);
        }
      },

      async uploadPostFile(projectId: string, postId: string, filePath: string): Promise<UploadFileResponse> {
        try {
          const fileName = basename(filePath);
          const fileBuffer = await readFile(filePath);

          const formData = new FormData();
          formData.append("file", new Blob([fileBuffer]), fileName);

          const url = http.url(apiPath`project/v1/projects/${projectId}/posts/${postId}/files`);
          const res = await fetch(url, {
            method: "POST",
            headers: { Authorization: http.authHeader },
            body: formData,
            redirect: "manual",
          });

          if (res.status === 307) {
            const uploadRes = await http.requestFileServer(res.headers.get("location"), "파일 업로드", {
              method: "POST",
              body: formData,
            });
            return await uploadRes.json() as UploadFileResponse;
          }

          if (!res.ok) {
            throw new DoorayCliError(`파일 업로드 실패 (${res.status})`, fileStatusExitCode(res.status));
          }

          return await res.json() as UploadFileResponse;
        } catch (e) {
          if (e instanceof DoorayCliError) throw e;
          throw await toDoorayCliError(e);
        }
      },

      async deletePostFile(projectId: string, postId: string, fileId: string): Promise<DoorayApiUnitResponse> {
        try {
          return await http.api
            .delete(apiPath`project/v1/projects/${projectId}/posts/${postId}/files/${fileId}`)
            .json<DoorayApiUnitResponse>();
        } catch (e) {
          throw await toDoorayCliError(e);
        }
      },
  };
  return client;
}
