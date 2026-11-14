import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { PublicHttp } from "@/api/public/http.js";
import type { WikiClient, CreateWikiCommentApiResponse, CreateWikiCommentRequest, CreateWikiPageRequest, CreateWikiPageResponse, GetWikisParams, MoveWikiPageRequest, UpdateWikiCommentRequest, UpdateWikiPageContentRequest, UpdateWikiPageRequest, UpdateWikiPageTitleRequest, UploadWikiPageFileResponse, WikiCommentDetailResponse, WikiCommentListResponse, WikiListResponse, WikiPageFileType, WikiPageResponse, WikiPagesResponse } from "./types.js";
import type { DoorayApiUnitResponse } from "@/api/common/types.js";
import { apiPath } from "@/api/api-path.js";
import { DoorayCliError } from "@/utils/errors.js";
import { fallbackFileName, parseContentDispositionFileName } from "@/utils/content-disposition.js";
import { fileStatusExitCode, toDoorayCliError } from "@/api/public/http.js";

/** wiki 영역의 공개 API 구현. 공용 HTTP 는 PublicHttp 가 맡는다. */
export function createWikiPublic(http: PublicHttp): WikiClient {
  const client: WikiClient = {
      async getWikis(params?: GetWikisParams): Promise<WikiListResponse> {
        try {
          return await http.api
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
      },

      async getWikiPages(wikiId: string, parentPageId?: string): Promise<WikiPagesResponse> {
        try {
          return await http.api
            .get(apiPath`wiki/v1/wikis/${wikiId}/pages`, {
              searchParams: {
                ...(parentPageId && { parentPageId }),
              },
            })
            .json<WikiPagesResponse>();
        } catch (e) {
          throw await toDoorayCliError(e);
        }
      },

      async getWikiPage(wikiId: string, pageId: string): Promise<WikiPageResponse> {
        try {
          return await http.api
            .get(apiPath`wiki/v1/wikis/${wikiId}/pages/${pageId}`)
            .json<WikiPageResponse>();
        } catch (e) {
          throw await toDoorayCliError(e);
        }
      },

      async getWikiPageStandalone(pageId: string): Promise<WikiPageResponse> {
        try {
          return await http.api
            .get(apiPath`wiki/v1/pages/${pageId}`)
            .json<WikiPageResponse>();
        } catch (e) {
          throw await toDoorayCliError(e);
        }
      },

      async createWikiPage(wikiId: string, body: CreateWikiPageRequest): Promise<CreateWikiPageResponse> {
        try {
          return await http.api
            .post(apiPath`wiki/v1/wikis/${wikiId}/pages`, { json: body })
            .json<CreateWikiPageResponse>();
        } catch (e) {
          throw await toDoorayCliError(e);
        }
      },

      async updateWikiPage(wikiId: string, pageId: string, body: UpdateWikiPageRequest): Promise<DoorayApiUnitResponse> {
        try {
          return await http.api
            .put(apiPath`wiki/v1/wikis/${wikiId}/pages/${pageId}`, { json: body })
            .json<DoorayApiUnitResponse>();
        } catch (e) {
          throw await toDoorayCliError(e);
        }
      },

      async updateWikiPageTitle(
        wikiId: string,
        pageId: string,
        body: UpdateWikiPageTitleRequest,
      ): Promise<DoorayApiUnitResponse> {
        try {
          return await http.api
            .put(apiPath`wiki/v1/wikis/${wikiId}/pages/${pageId}/title`, { json: body })
            .json<DoorayApiUnitResponse>();
        } catch (e) {
          throw await toDoorayCliError(e);
        }
      },

      async updateWikiPageContent(
        wikiId: string,
        pageId: string,
        body: UpdateWikiPageContentRequest,
      ): Promise<DoorayApiUnitResponse> {
        try {
          return await http.api
            .put(apiPath`wiki/v1/wikis/${wikiId}/pages/${pageId}/content`, { json: body })
            .json<DoorayApiUnitResponse>();
        } catch (e) {
          throw await toDoorayCliError(e);
        }
      },

      // Dooray 공식 API 문서에 있는 endpoint 다 (ADR-032)
      async deleteWikiPage(wikiId: string, pageId: string): Promise<DoorayApiUnitResponse> {
        try {
          return await http.api
            .delete(apiPath`wiki/v1/wikis/${wikiId}/pages/${pageId}`)
            .json<DoorayApiUnitResponse>();
        } catch (e) {
          throw await toDoorayCliError(e);
        }
      },

      async moveWikiPage(
        wikiId: string,
        pageId: string,
        body: MoveWikiPageRequest,
      ): Promise<DoorayApiUnitResponse> {
        try {
          return await http.api
            .post(apiPath`wiki/v1/wikis/${wikiId}/pages/${pageId}/move`, { json: body })
            .json<DoorayApiUnitResponse>();
        } catch (e) {
          throw await toDoorayCliError(e);
        }
      },

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

          const url = http.url(apiPath`wiki/v1/wikis/${wikiId}/pages/${pageId}/files`);
          const res = await fetch(url, {
            method: "POST",
            headers: { Authorization: http.authHeader },
            body: buildFormData(),
            redirect: "manual",
          });

          if (res.status === 307) {
            // 재시도 시에도 FormData 새로 빌드 (type → file 순서 보장)
            const uploadRes = await http.requestFileServer(res.headers.get("location"), "위키 파일 업로드", {
              method: "POST",
              body: buildFormData(),
            });
            return await uploadRes.json() as UploadWikiPageFileResponse;
          }

          if (!res.ok) {
            throw new DoorayCliError(`위키 파일 업로드 실패 (${res.status})`, fileStatusExitCode(res.status));
          }
          return await res.json() as UploadWikiPageFileResponse;
        } catch (e) {
          if (e instanceof DoorayCliError) throw e;
          throw await toDoorayCliError(e);
        }
      },

      async downloadWikiPageFile(
        wikiId: string,
        pageId: string,
        fileId: string,
        knownName?: string,
      ): Promise<{ buffer: ArrayBuffer; fileName: string }> {
        try {
          const res = await http.api
            .get(apiPath`wiki/v1/wikis/${wikiId}/pages/${pageId}/files/${fileId}`, {
              redirect: "manual",
              throwHttpErrors: false,
            });
          const fileRes = await http.followDownloadRedirect(res, "위키 파일 다운로드");

          const disposition = fileRes.headers.get("content-disposition");
          let fileName = parseContentDispositionFileName(disposition);
          if (!fileName) {
            let listName = knownName;
            if (!listName) {
              const page = await client.getWikiPage(wikiId, pageId).catch(() => null);
              const files = [...(page?.result.files ?? []), ...(page?.result.images ?? [])];
              listName = files.find((f) => f.id === fileId)?.name;
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

      async deleteWikiPageFile(
        wikiId: string,
        pageId: string,
        fileId: string,
      ): Promise<DoorayApiUnitResponse> {
        try {
          return await http.api
            .delete(apiPath`wiki/v1/wikis/${wikiId}/pages/${pageId}/files/${fileId}`)
            .json<DoorayApiUnitResponse>();
        } catch (e) {
          throw await toDoorayCliError(e);
        }
      },

      async getWikiPageComments(
        wikiId: string,
        pageId: string,
        params?: { page?: number; size?: number },
      ): Promise<WikiCommentListResponse> {
        try {
          return await http.api
            .get(apiPath`wiki/v1/wikis/${wikiId}/pages/${pageId}/comments`, {
              searchParams: {
                ...(params?.page !== undefined && { page: params.page }),
                ...(params?.size !== undefined && { size: params.size }),
              },
            })
            .json<WikiCommentListResponse>();
        } catch (e) {
          throw await toDoorayCliError(e);
        }
      },

      async getWikiPageComment(
        wikiId: string,
        pageId: string,
        commentId: string,
      ): Promise<WikiCommentDetailResponse> {
        try {
          return await http.api
            .get(apiPath`wiki/v1/wikis/${wikiId}/pages/${pageId}/comments/${commentId}`)
            .json<WikiCommentDetailResponse>();
        } catch (e) {
          throw await toDoorayCliError(e);
        }
      },

      async addWikiPageComment(
        wikiId: string,
        pageId: string,
        body: CreateWikiCommentRequest,
      ): Promise<CreateWikiCommentApiResponse> {
        try {
          return await http.api
            .post(apiPath`wiki/v1/wikis/${wikiId}/pages/${pageId}/comments`, { json: body })
            .json<CreateWikiCommentApiResponse>();
        } catch (e) {
          throw await toDoorayCliError(e);
        }
      },

      async updateWikiPageComment(
        wikiId: string,
        pageId: string,
        commentId: string,
        body: UpdateWikiCommentRequest,
      ): Promise<DoorayApiUnitResponse> {
        try {
          return await http.api
            .put(apiPath`wiki/v1/wikis/${wikiId}/pages/${pageId}/comments/${commentId}`, { json: body })
            .json<DoorayApiUnitResponse>();
        } catch (e) {
          throw await toDoorayCliError(e);
        }
      },

      async deleteWikiPageComment(
        wikiId: string,
        pageId: string,
        commentId: string,
      ): Promise<DoorayApiUnitResponse> {
        try {
          return await http.api
            .delete(apiPath`wiki/v1/wikis/${wikiId}/pages/${pageId}/comments/${commentId}`)
            .json<DoorayApiUnitResponse>();
        } catch (e) {
          throw await toDoorayCliError(e);
        }
      },
  };
  return client;
}
