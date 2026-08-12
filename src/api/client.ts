import ky, { type KyInstance, HTTPError } from "ky";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { basename } from "node:path";
import { DoorayCliError } from "../utils/errors.js";
import { normalizeDoorayMessage } from "../utils/dooray-message.js";
import { EXIT_API_ERROR, EXIT_AUTH_ERROR } from "../utils/exit-codes.js";
import { createTokenBucket, parseRateLimitHeaders } from "./rate-limiter.js";
import type {
  ProjectListResponse,
  PostListResponse,
  PostDetailResponse,
  CreatePostApiResponse,
  CreatePostRequest,
  UpdatePostRequest,
  UpdatePostResponse,
  SetWorkflowRequest,
  SetParentPostRequest,
  PostCommentListResponse,
  PostCommentDetailResponse,
  CreateCommentApiResponse,
  CreateCommentRequest,
  UpdateCommentRequest,
  UpdateCommentResponse,
  DeleteCommentResponse,
  ProjectMemberListResponse,
  ProjectWorkflowListResponse,
  MemberDetailResponse,
  MemberSearchResponse,
  MeResponse,
  TagListResponse,
  MilestoneListResponse,
  MemberGroupListResponse,
  WikiListResponse,
  WikiPage,
  WikiPagesResponse,
  WikiPageResponse,
  CreateWikiPageRequest,
  CreateWikiPageResponse,
  UpdateWikiPageRequest,
  UpdateWikiPageTitleRequest,
  UpdateWikiPageContentRequest,
  WikiPageFileType,
  UploadWikiPageFileResponse,
  WikiCommentListResponse,
  WikiCommentDetailResponse,
  CreateWikiCommentRequest,
  UpdateWikiCommentRequest,
  CreateWikiCommentApiResponse,
  DoorayApiUnitResponse,
  DoorayErrorResponse,
  PostFileListResponse,
  PostFileMetaResponse,
  UploadFileResponse,
  TemplateListResponse,
  TemplateDetailResponse,
  DirectSendRequest,
  ChannelLogRequest,
  MessengerSendResponse,
  MessengerChannelListResponse,
} from "./types.js";

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

export interface GetProjectsParams {
  page?: number;
  size?: number;
  type?: string;
  scope?: string;
  state?: string;
}

export interface GetPostCommentsParams {
  page?: number;
  size?: number;
  order?: "createdAt" | "-createdAt";
}

export interface GetMembersParams {
  page?: number;
  size?: number;
}

export interface SearchMembersParams {
  name?: string;
  externalEmailAddresses?: string;
  userCode?: string;
  userCodeExact?: string;
  idProviderUserId?: string;
  page?: number;
  size?: number;
}

export interface GetWikisParams {
  page?: number;
  size?: number;
}

function joinIds(ids: string[] | undefined): string | undefined {
  return ids && ids.length > 0 ? ids.join(",") : undefined;
}

async function toDoorayCliError(error: unknown): Promise<never> {
  if (error instanceof HTTPError) {
    const status = error.response.status;
    const exitCode = status === 401 || status === 403 ? EXIT_AUTH_ERROR : EXIT_API_ERROR;
    try {
      const body = (await error.response.json()) as DoorayErrorResponse;
      // NOTE: form-encoding 관례로 `+`를 공백으로 치환한다.
      // Dooray resultMessage에 의도된 `+`가 포함된 경우 공백으로 바뀌는 부작용이
      // 있으나, 실측된 메시지는 대부분 한국어 설명문이라 수용 가능한 트레이드오프.
      throw new DoorayCliError(
        `API 호출 실패: ${normalizeDoorayMessage(body.header.resultMessage)}`,
        exitCode,
      );
    } catch (e) {
      if (e instanceof DoorayCliError) throw e;
      throw new DoorayCliError(
        `API 호출 실패 (${status}): ${error.message}`,
        exitCode,
      );
    }
  }
  throw error;
}

export class DoorayApiClient {
  private readonly api: KyInstance;
  private readonly authHeader: string;
  private readonly baseUrl: string;

  constructor(apiKey: string, baseUrl: string) {
    this.authHeader = `dooray-api ${apiKey}`;
    this.baseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
    const bucket = createTokenBucket();
    this.api = ky.create({
      prefix: baseUrl,
      headers: {
        Authorization: this.authHeader,
      },
      // 429 는 재시도할 가치가 있지만, 동시 요청이 한꺼번에 재시도하면 같은 결과가 반복된다.
      // jitter 로 재시도 시점을 흩고, 아래 훅이 재시도분도 버킷을 거치게 한다.
      retry: {
        limit: 3,
        statusCodes: [408, 413, 429, 500, 502, 503, 504],
        backoffLimit: 8000,
        jitter: true,
      },
      hooks: {
        // beforeRequest 는 재시도에는 돌지 않으므로 beforeRetry 에서도 토큰을 받는다.
        beforeRequest: [
          async () => {
            await bucket.acquire();
          },
        ],
        beforeRetry: [
          async ({ error }) => {
            const response = (error as { response?: Response }).response;
            if (response?.status === 429) bucket.drain();
            await bucket.acquire();
          },
        ],
        afterResponse: [
          ({ response }) => {
            bucket.sync(parseRateLimitHeaders(response.headers));
          },
        ],
      },
    });
  }

  // ─── Me ─────────────────────────────────────────────

  async getMe(): Promise<MeResponse> {
    try {
      return await this.api
        .get("common/v1/members/me")
        .json<MeResponse>();
    } catch (e) {
      throw await toDoorayCliError(e);
    }
  }

  // ─── Projects ───────────────────────────────────────

  async getProjects(params?: GetProjectsParams): Promise<ProjectListResponse> {
    try {
      return await this.api
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
  }

  // ─── Posts ──────────────────────────────────────────

  async getPosts(projectId: string, params?: GetPostsParams): Promise<PostListResponse> {
    try {
      return await this.api
        .get(`project/v1/projects/${projectId}/posts`, {
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
  }

  async getPost(projectId: string, postId: string): Promise<PostDetailResponse> {
    try {
      return await this.api
        .get(`project/v1/projects/${projectId}/posts/${postId}`)
        .json<PostDetailResponse>();
    } catch (e) {
      throw await toDoorayCliError(e);
    }
  }

  async getPostStandalone(postId: string): Promise<PostDetailResponse> {
    try {
      return await this.api
        .get(`project/v1/posts/${postId}`)
        .json<PostDetailResponse>();
    } catch (e) {
      throw await toDoorayCliError(e);
    }
  }

  async createPost(projectId: string, body: CreatePostRequest): Promise<CreatePostApiResponse> {
    try {
      return await this.api
        .post(`project/v1/projects/${projectId}/posts`, { json: body })
        .json<CreatePostApiResponse>();
    } catch (e) {
      throw await toDoorayCliError(e);
    }
  }

  async updatePost(projectId: string, postId: string, body: UpdatePostRequest): Promise<UpdatePostResponse> {
    try {
      return await this.api
        .put(`project/v1/projects/${projectId}/posts/${postId}`, { json: body })
        .json<UpdatePostResponse>();
    } catch (e) {
      throw await toDoorayCliError(e);
    }
  }

  async setPostDone(projectId: string, postId: string): Promise<DoorayApiUnitResponse> {
    try {
      return await this.api
        .post(`project/v1/projects/${projectId}/posts/${postId}/set-done`)
        .json<DoorayApiUnitResponse>();
    } catch (e) {
      throw await toDoorayCliError(e);
    }
  }

  async setPostWorkflow(projectId: string, postId: string, workflowId: string): Promise<DoorayApiUnitResponse> {
    try {
      return await this.api
        .post(`project/v1/projects/${projectId}/posts/${postId}/set-workflow`, {
          json: { workflowId } satisfies SetWorkflowRequest,
        })
        .json<DoorayApiUnitResponse>();
    } catch (e) {
      throw await toDoorayCliError(e);
    }
  }

  async setPostParent(projectId: string, postId: string, parentPostId: string): Promise<DoorayApiUnitResponse> {
    try {
      return await this.api
        .post(`project/v1/projects/${projectId}/posts/${postId}/set-parent-post`, {
          json: { parentPostId } satisfies SetParentPostRequest,
        })
        .json<DoorayApiUnitResponse>();
    } catch (e) {
      throw await toDoorayCliError(e);
    }
  }

  // ─── Post Comments ──────────────────────────────────

  async getPostComments(projectId: string, postId: string, params?: GetPostCommentsParams): Promise<PostCommentListResponse> {
    try {
      return await this.api
        .get(`project/v1/projects/${projectId}/posts/${postId}/logs`, {
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
  }

  async getPostComment(
    projectId: string,
    postId: string,
    logId: string,
  ): Promise<PostCommentDetailResponse> {
    try {
      return await this.api
        .get(`project/v1/projects/${projectId}/posts/${postId}/logs/${logId}`)
        .json<PostCommentDetailResponse>();
    } catch (e) {
      throw await toDoorayCliError(e);
    }
  }

  async createPostComment(projectId: string, postId: string, body: CreateCommentRequest): Promise<CreateCommentApiResponse> {
    try {
      return await this.api
        .post(`project/v1/projects/${projectId}/posts/${postId}/logs`, { json: body })
        .json<CreateCommentApiResponse>();
    } catch (e) {
      throw await toDoorayCliError(e);
    }
  }

  async updatePostComment(projectId: string, postId: string, logId: string, body: UpdateCommentRequest): Promise<UpdateCommentResponse> {
    try {
      return await this.api
        .put(`project/v1/projects/${projectId}/posts/${postId}/logs/${logId}`, { json: body })
        .json<UpdateCommentResponse>();
    } catch (e) {
      throw await toDoorayCliError(e);
    }
  }

  async deletePostComment(projectId: string, postId: string, logId: string): Promise<DeleteCommentResponse> {
    try {
      return await this.api
        .delete(`project/v1/projects/${projectId}/posts/${postId}/logs/${logId}`)
        .json<DeleteCommentResponse>();
    } catch (e) {
      throw await toDoorayCliError(e);
    }
  }

  // ─── Members ────────────────────────────────────────

  async getProjectMembers(projectId: string, params?: GetMembersParams): Promise<ProjectMemberListResponse> {
    try {
      return await this.api
        .get(`project/v1/projects/${projectId}/members`, {
          searchParams: {
            member: "me",
            ...(params?.page != null && { page: params.page }),
            ...(params?.size != null && { size: params.size }),
          },
        })
        .json<ProjectMemberListResponse>();
    } catch (e) {
      throw await toDoorayCliError(e);
    }
  }

  async getMemberDetail(memberId: string): Promise<MemberDetailResponse> {
    try {
      return await this.api
        .get(`common/v1/members/${memberId}`)
        .json<MemberDetailResponse>();
    } catch (e) {
      throw await toDoorayCliError(e);
    }
  }

  async searchMembers(params: SearchMembersParams): Promise<MemberSearchResponse> {
    try {
      return await this.api
        .get("common/v1/members", {
          searchParams: {
            ...(params.name && { name: params.name }),
            ...(params.externalEmailAddresses && { externalEmailAddresses: params.externalEmailAddresses }),
            ...(params.userCode && { userCode: params.userCode }),
            ...(params.userCodeExact && { userCodeExact: params.userCodeExact }),
            ...(params.idProviderUserId && { idProviderUserId: params.idProviderUserId }),
            ...(params.page != null && { page: params.page }),
            ...(params.size != null && { size: params.size }),
          },
        })
        .json<MemberSearchResponse>();
    } catch (e) {
      throw await toDoorayCliError(e);
    }
  }

  // ─── Workflows ──────────────────────────────────────

  async getProjectWorkflows(projectId: string): Promise<ProjectWorkflowListResponse> {
    try {
      return await this.api
        .get(`project/v1/projects/${projectId}/workflows`)
        .json<ProjectWorkflowListResponse>();
    } catch (e) {
      throw await toDoorayCliError(e);
    }
  }

  // ─── Tags ───────────────────────────────────────────

  async getProjectTags(
    projectId: string,
    params?: { page?: number; size?: number },
  ): Promise<TagListResponse> {
    try {
      return await this.api
        .get(`project/v1/projects/${projectId}/tags`, {
          searchParams: {
            ...(params?.page != null && { page: params.page }),
            ...(params?.size != null && { size: params.size }),
          },
        })
        .json<TagListResponse>();
    } catch (e) {
      throw await toDoorayCliError(e);
    }
  }

  // ─── Member Groups ──────────────────────────────────

  async getProjectMemberGroups(
    projectId: string,
    params?: { page?: number; size?: number },
  ): Promise<MemberGroupListResponse> {
    try {
      return await this.api
        .get(`project/v1/projects/${projectId}/member-groups`, {
          searchParams: {
            ...(params?.page != null && { page: params.page }),
            ...(params?.size != null && { size: params.size }),
          },
        })
        .json<MemberGroupListResponse>();
    } catch (e) {
      throw await toDoorayCliError(e);
    }
  }

  // ─── Milestones ─────────────────────────────────────

  async getProjectMilestones(
    projectId: string,
    params?: { page?: number; size?: number },
  ): Promise<MilestoneListResponse> {
    try {
      return await this.api
        .get(`project/v1/projects/${projectId}/milestones`, {
          searchParams: {
            ...(params?.page != null && { page: params.page }),
            ...(params?.size != null && { size: params.size }),
          },
        })
        .json<MilestoneListResponse>();
    } catch (e) {
      throw await toDoorayCliError(e);
    }
  }

  // ─── Wiki ───────────────────────────────────────────

  async getWikis(params?: GetWikisParams): Promise<WikiListResponse> {
    try {
      return await this.api
        .get("wiki/v1/wikis", {
          searchParams: {
            ...(params?.page != null && { page: params.page }),
            ...(params?.size != null && { size: params.size }),
          },
        })
        .json<WikiListResponse>();
    } catch (e) {
      throw await toDoorayCliError(e);
    }
  }

  async getWikiPages(wikiId: string, parentPageId?: string): Promise<WikiPagesResponse> {
    try {
      return await this.api
        .get(`wiki/v1/wikis/${wikiId}/pages`, {
          searchParams: {
            ...(parentPageId && { parentPageId }),
          },
        })
        .json<WikiPagesResponse>();
    } catch (e) {
      throw await toDoorayCliError(e);
    }
  }

  async getAllWikiPages(wikiId: string, maxDepth?: number): Promise<WikiPage[]> {
    // 한 레벨의 형제 자식 조회를 병렬화하되, 동시 요청 수를 상한으로 제한한다.
    // 상한이 없으면 자식이 수백 개인 레벨에서 병렬 요청이 폭증해
    // rate limit / 커넥션 고갈 위험이 있다. chunk 를 순서대로 처리해
    // 레벨 내 페이지 순서는 그대로 보존한다.
    const CONCURRENCY = 10;
    const all: WikiPage[] = [];
    let level = (await this.getWikiPages(wikiId)).result;
    let depth = 1;
    while (level.length > 0) {
      all.push(...level);
      if (maxDepth !== undefined && depth >= maxDepth) break;
      const next: WikiPage[] = [];
      for (let i = 0; i < level.length; i += CONCURRENCY) {
        const chunk = level.slice(i, i + CONCURRENCY);
        const batches = await Promise.all(
          chunk.map((p) => this.getWikiPages(wikiId, p.id).then((r) => r.result)),
        );
        next.push(...batches.flat());
      }
      level = next;
      depth++;
    }
    return all;
  }

  async getWikiPage(wikiId: string, pageId: string): Promise<WikiPageResponse> {
    try {
      return await this.api
        .get(`wiki/v1/wikis/${wikiId}/pages/${pageId}`)
        .json<WikiPageResponse>();
    } catch (e) {
      throw await toDoorayCliError(e);
    }
  }

  async createWikiPage(wikiId: string, body: CreateWikiPageRequest): Promise<CreateWikiPageResponse> {
    try {
      return await this.api
        .post(`wiki/v1/wikis/${wikiId}/pages`, { json: body })
        .json<CreateWikiPageResponse>();
    } catch (e) {
      throw await toDoorayCliError(e);
    }
  }

  async updateWikiPage(wikiId: string, pageId: string, body: UpdateWikiPageRequest): Promise<DoorayApiUnitResponse> {
    try {
      return await this.api
        .put(`wiki/v1/wikis/${wikiId}/pages/${pageId}`, { json: body })
        .json<DoorayApiUnitResponse>();
    } catch (e) {
      throw await toDoorayCliError(e);
    }
  }

  async updateWikiPageTitle(
    wikiId: string,
    pageId: string,
    body: UpdateWikiPageTitleRequest,
  ): Promise<DoorayApiUnitResponse> {
    try {
      return await this.api
        .put(`wiki/v1/wikis/${wikiId}/pages/${pageId}/title`, { json: body })
        .json<DoorayApiUnitResponse>();
    } catch (e) {
      throw await toDoorayCliError(e);
    }
  }

  async updateWikiPageContent(
    wikiId: string,
    pageId: string,
    body: UpdateWikiPageContentRequest,
  ): Promise<DoorayApiUnitResponse> {
    try {
      return await this.api
        .put(`wiki/v1/wikis/${wikiId}/pages/${pageId}/content`, { json: body })
        .json<DoorayApiUnitResponse>();
    } catch (e) {
      throw await toDoorayCliError(e);
    }
  }

  // 비공식(미문서화) endpoint — Dooray 공식 API 문서에 없으나 실측 확인 (ADR-032)
  async deleteWikiPage(wikiId: string, pageId: string): Promise<DoorayApiUnitResponse> {
    try {
      return await this.api
        .delete(`wiki/v1/wikis/${wikiId}/pages/${pageId}`)
        .json<DoorayApiUnitResponse>();
    } catch (e) {
      throw await toDoorayCliError(e);
    }
  }

  // ─── Post Files ─────────────────────────────────────

  async getPostFiles(projectId: string, postId: string): Promise<PostFileListResponse> {
    try {
      return await this.api
        .get(`project/v1/projects/${projectId}/posts/${postId}/files`)
        .json<PostFileListResponse>();
    } catch (e) {
      throw await toDoorayCliError(e);
    }
  }

  async getPostFileMeta(projectId: string, postId: string, fileId: string): Promise<PostFileMetaResponse> {
    try {
      return await this.api
        .get(`project/v1/projects/${projectId}/posts/${postId}/files/${fileId}`, {
          searchParams: { media: "meta" },
        })
        .json<PostFileMetaResponse>();
    } catch (e) {
      throw await toDoorayCliError(e);
    }
  }

  async downloadPostFile(projectId: string, postId: string, fileId: string): Promise<{ buffer: ArrayBuffer; fileName: string }> {
    try {
      const res = await this.api
        .get(`project/v1/projects/${projectId}/posts/${postId}/files/${fileId}`, {
          searchParams: { media: "raw" },
          redirect: "manual",
          throwHttpErrors: false,
        });

      const location = res.headers.get("location");
      if (!location) {
        throw new DoorayCliError("파일 다운로드 리다이렉트 URL을 받지 못했습니다.", EXIT_API_ERROR);
      }

      const fileRes = await fetch(location, {
        headers: { Authorization: this.authHeader },
      });

      if (!fileRes.ok) {
        throw new DoorayCliError(`파일 다운로드 실패 (${fileRes.status})`, EXIT_API_ERROR);
      }

      const disposition = fileRes.headers.get("content-disposition");
      let fileName = `file-${fileId}`;
      if (disposition) {
        const match = disposition.match(/filename\*?=(?:UTF-8''|"?)([^";]+)/i);
        if (match) fileName = decodeURIComponent(match[1].replace(/"/g, ""));
      }

      const buffer = await fileRes.arrayBuffer();
      return { buffer, fileName };
    } catch (e) {
      if (e instanceof DoorayCliError) throw e;
      throw await toDoorayCliError(e);
    }
  }

  async uploadPostFile(projectId: string, postId: string, filePath: string): Promise<UploadFileResponse> {
    try {
      const fileName = basename(filePath);
      const fileBuffer = await readFile(filePath);

      const formData = new FormData();
      formData.append("file", new Blob([fileBuffer]), fileName);

      const url = `${this.baseUrl}project/v1/projects/${projectId}/posts/${postId}/files`;
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: this.authHeader },
        body: formData,
        redirect: "manual",
      });

      if (res.status === 307) {
        const location = res.headers.get("location");
        if (!location) {
          throw new DoorayCliError("파일 업로드 리다이렉트 URL을 받지 못했습니다.", EXIT_API_ERROR);
        }

        const uploadRes = await fetch(location, {
          method: "POST",
          headers: { Authorization: this.authHeader },
          body: formData,
        });

        if (!uploadRes.ok) {
          throw new DoorayCliError(`파일 업로드 실패 (${uploadRes.status})`, EXIT_API_ERROR);
        }

        return await uploadRes.json() as UploadFileResponse;
      }

      if (!res.ok) {
        throw new DoorayCliError(`파일 업로드 실패 (${res.status})`, EXIT_API_ERROR);
      }

      return await res.json() as UploadFileResponse;
    } catch (e) {
      if (e instanceof DoorayCliError) throw e;
      throw await toDoorayCliError(e);
    }
  }

  async deletePostFile(projectId: string, postId: string, fileId: string): Promise<DoorayApiUnitResponse> {
    try {
      return await this.api
        .delete(`project/v1/projects/${projectId}/posts/${postId}/files/${fileId}`)
        .json<DoorayApiUnitResponse>();
    } catch (e) {
      throw await toDoorayCliError(e);
    }
  }

  // ─── Wiki Page Files (ADR-029) ──────────────────────

  async uploadWikiPageFile(
    wikiId: string,
    pageId: string,
    filePath: string,
    type: WikiPageFileType,
  ): Promise<UploadWikiPageFileResponse> {
    try {
      const fileName = basename(filePath);
      const fileBuffer = await readFile(filePath);

      // ADR-029: type 필드를 file 필드보다 먼저 append (Dooray 서버 순서 의존)
      const buildFormData = (): FormData => {
        const fd = new FormData();
        fd.append("type", type);
        fd.append("file", new Blob([fileBuffer]), fileName);
        return fd;
      };

      const url = `${this.baseUrl}wiki/v1/wikis/${wikiId}/pages/${pageId}/files`;
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: this.authHeader },
        body: buildFormData(),
        redirect: "manual",
      });

      if (res.status === 307) {
        const location = res.headers.get("location");
        if (!location) {
          throw new DoorayCliError("위키 파일 업로드 리다이렉트 URL을 받지 못했습니다.", EXIT_API_ERROR);
        }
        // 재시도 시에도 FormData 새로 빌드 (type → file 순서 보장)
        const uploadRes = await fetch(location, {
          method: "POST",
          headers: { Authorization: this.authHeader },
          body: buildFormData(),
        });
        if (!uploadRes.ok) {
          throw new DoorayCliError(`위키 파일 업로드 실패 (${uploadRes.status})`, EXIT_API_ERROR);
        }
        return await uploadRes.json() as UploadWikiPageFileResponse;
      }

      if (!res.ok) {
        throw new DoorayCliError(`위키 파일 업로드 실패 (${res.status})`, EXIT_API_ERROR);
      }
      return await res.json() as UploadWikiPageFileResponse;
    } catch (e) {
      if (e instanceof DoorayCliError) throw e;
      throw await toDoorayCliError(e);
    }
  }

  async downloadWikiPageFile(
    wikiId: string,
    pageId: string,
    fileId: string,
  ): Promise<{ buffer: ArrayBuffer; fileName: string }> {
    try {
      const res = await this.api
        .get(`wiki/v1/wikis/${wikiId}/pages/${pageId}/files/${fileId}`, {
          redirect: "manual",
          throwHttpErrors: false,
        });

      // ADR-015: 파일 다운로드 endpoint 는 항상 307 redirect 응답.
      // 307 외 status 는 에러 (200 직접 응답 케이스는 Dooray 가 보장하지 않음).
      if (res.status !== 307) {
        throw new DoorayCliError(
          `위키 파일 다운로드 실패 (예상 status 307, 실제 ${res.status})`,
          EXIT_API_ERROR,
        );
      }

      const location = res.headers.get("location");
      if (!location) {
        throw new DoorayCliError("위키 파일 다운로드 리다이렉트 URL을 받지 못했습니다.", EXIT_API_ERROR);
      }

      const fileRes = await fetch(location, {
        headers: { Authorization: this.authHeader },
      });
      if (!fileRes.ok) {
        throw new DoorayCliError(`위키 파일 다운로드 실패 (${fileRes.status})`, EXIT_API_ERROR);
      }

      const disposition = fileRes.headers.get("content-disposition");
      let fileName = `file-${fileId}`;
      if (disposition) {
        const match = disposition.match(/filename\*?=(?:UTF-8''|"?)([^";]+)/i);
        // basename 으로 path traversal 방지 (서버 응답 헤더의 ../ 등 제거)
        if (match) fileName = basename(decodeURIComponent(match[1].replace(/"/g, "")));
      }

      const buffer = await fileRes.arrayBuffer();
      return { buffer, fileName };
    } catch (e) {
      if (e instanceof DoorayCliError) throw e;
      throw await toDoorayCliError(e);
    }
  }

  async deleteWikiPageFile(
    wikiId: string,
    pageId: string,
    fileId: string,
  ): Promise<DoorayApiUnitResponse> {
    try {
      return await this.api
        .delete(`wiki/v1/wikis/${wikiId}/pages/${pageId}/files/${fileId}`)
        .json<DoorayApiUnitResponse>();
    } catch (e) {
      throw await toDoorayCliError(e);
    }
  }

  // ─── Wiki Page Comments ─────────────────────────────

  async getWikiPageComments(
    wikiId: string,
    pageId: string,
    params?: { page?: number; size?: number },
  ): Promise<WikiCommentListResponse> {
    try {
      return await this.api
        .get(`wiki/v1/wikis/${wikiId}/pages/${pageId}/comments`, {
          searchParams: {
            ...(params?.page !== undefined && { page: params.page }),
            ...(params?.size !== undefined && { size: params.size }),
          },
        })
        .json<WikiCommentListResponse>();
    } catch (e) {
      throw await toDoorayCliError(e);
    }
  }

  async getWikiPageComment(
    wikiId: string,
    pageId: string,
    commentId: string,
  ): Promise<WikiCommentDetailResponse> {
    try {
      return await this.api
        .get(`wiki/v1/wikis/${wikiId}/pages/${pageId}/comments/${commentId}`)
        .json<WikiCommentDetailResponse>();
    } catch (e) {
      throw await toDoorayCliError(e);
    }
  }

  async addWikiPageComment(
    wikiId: string,
    pageId: string,
    body: CreateWikiCommentRequest,
  ): Promise<CreateWikiCommentApiResponse> {
    try {
      return await this.api
        .post(`wiki/v1/wikis/${wikiId}/pages/${pageId}/comments`, { json: body })
        .json<CreateWikiCommentApiResponse>();
    } catch (e) {
      throw await toDoorayCliError(e);
    }
  }

  async updateWikiPageComment(
    wikiId: string,
    pageId: string,
    commentId: string,
    body: UpdateWikiCommentRequest,
  ): Promise<DoorayApiUnitResponse> {
    try {
      return await this.api
        .put(`wiki/v1/wikis/${wikiId}/pages/${pageId}/comments/${commentId}`, { json: body })
        .json<DoorayApiUnitResponse>();
    } catch (e) {
      throw await toDoorayCliError(e);
    }
  }

  async deleteWikiPageComment(
    wikiId: string,
    pageId: string,
    commentId: string,
  ): Promise<DoorayApiUnitResponse> {
    try {
      return await this.api
        .delete(`wiki/v1/wikis/${wikiId}/pages/${pageId}/comments/${commentId}`)
        .json<DoorayApiUnitResponse>();
    } catch (e) {
      throw await toDoorayCliError(e);
    }
  }

  // ─── Templates ──────────────────────────────────────

  async getProjectTemplates(
    projectId: string,
    params?: { page?: number; size?: number },
  ): Promise<TemplateListResponse> {
    try {
      return await this.api
        .get(`project/v1/projects/${projectId}/templates`, {
          searchParams: {
            ...(params?.page != null && { page: params.page }),
            ...(params?.size != null && { size: params.size }),
          },
        })
        .json<TemplateListResponse>();
    } catch (e) {
      throw await toDoorayCliError(e);
    }
  }

  async getProjectTemplateDetail(
    projectId: string,
    templateId: string,
    interpolation: boolean = true,
  ): Promise<TemplateDetailResponse> {
    try {
      return await this.api
        .get(`project/v1/projects/${projectId}/templates/${templateId}`, {
          searchParams: { interpolation: String(interpolation) },
        })
        .json<TemplateDetailResponse>();
    } catch (e) {
      throw await toDoorayCliError(e);
    }
  }

  // ─── Messenger (ADR-033) ────────────────────────────

  async sendDirectMessage(
    organizationMemberId: string,
    text: string,
  ): Promise<MessengerSendResponse> {
    try {
      return await this.api
        .post("messenger/v1/channels/direct-send", {
          json: { text, organizationMemberId } satisfies DirectSendRequest,
        })
        .json<MessengerSendResponse>();
    } catch (e) {
      throw await toDoorayCliError(e);
    }
  }

  async sendChannelMessage(channelId: string, text: string): Promise<MessengerSendResponse> {
    try {
      return await this.api
        .post(`messenger/v1/channels/${channelId}/logs`, {
          json: { text } satisfies ChannelLogRequest,
        })
        .json<MessengerSendResponse>();
    } catch (e) {
      throw await toDoorayCliError(e);
    }
  }

  async getMessengerChannels(): Promise<MessengerChannelListResponse> {
    try {
      return await this.api
        .get("messenger/v1/channels")
        .json<MessengerChannelListResponse>();
    } catch (e) {
      throw await toDoorayCliError(e);
    }
  }
}
