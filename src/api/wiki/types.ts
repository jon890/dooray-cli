/** wiki 영역의 공개 메서드 계약. DTO 는 api/types.ts 가 소유한다. */
import type { WikiListResponse, WikiPage, WikiPagesResponse, WikiPageResponse, CreateWikiPageRequest, CreateWikiPageResponse, UpdateWikiPageRequest, UpdateWikiPageTitleRequest, UpdateWikiPageContentRequest, MoveWikiPageRequest, WikiPageFileType, UploadWikiPageFileResponse, WikiCommentListResponse, WikiCommentDetailResponse, CreateWikiCommentRequest, UpdateWikiCommentRequest, CreateWikiCommentApiResponse, DoorayApiUnitResponse } from "../types.js";
import type { GetWikisParams } from "../client.js";

export interface WikiClient {
  getWikis(params?: GetWikisParams): Promise<WikiListResponse>;
  getWikiPages(wikiId: string, parentPageId?: string): Promise<WikiPagesResponse>;
  getAllWikiPages(wikiId: string, maxDepth?: number): Promise<WikiPage[]>;
  getWikiPage(wikiId: string, pageId: string): Promise<WikiPageResponse>;
  getWikiPageStandalone(pageId: string): Promise<WikiPageResponse>;
  createWikiPage(wikiId: string, body: CreateWikiPageRequest): Promise<CreateWikiPageResponse>;
  updateWikiPage(wikiId: string, pageId: string, body: UpdateWikiPageRequest): Promise<DoorayApiUnitResponse>;
  updateWikiPageTitle(wikiId: string, pageId: string, body: UpdateWikiPageTitleRequest): Promise<DoorayApiUnitResponse>;
  updateWikiPageContent(wikiId: string, pageId: string, body: UpdateWikiPageContentRequest): Promise<DoorayApiUnitResponse>;
  deleteWikiPage(wikiId: string, pageId: string): Promise<DoorayApiUnitResponse>;
  moveWikiPage(wikiId: string, pageId: string, body: MoveWikiPageRequest): Promise<DoorayApiUnitResponse>;
  uploadWikiPageFile(wikiId: string, pageId: string, filePath: string, type: WikiPageFileType): Promise<UploadWikiPageFileResponse>;
  downloadWikiPageFile(wikiId: string, pageId: string, fileId: string, knownName?: string): Promise<{ buffer: ArrayBuffer; fileName: string }>;
  deleteWikiPageFile(wikiId: string, pageId: string, fileId: string): Promise<DoorayApiUnitResponse>;
  getWikiPageComments(wikiId: string, pageId: string, params?: { page?: number; size?: number }): Promise<WikiCommentListResponse>;
  getWikiPageComment(wikiId: string, pageId: string, commentId: string): Promise<WikiCommentDetailResponse>;
  addWikiPageComment(wikiId: string, pageId: string, body: CreateWikiCommentRequest): Promise<CreateWikiCommentApiResponse>;
  updateWikiPageComment(wikiId: string, pageId: string, commentId: string, body: UpdateWikiCommentRequest): Promise<DoorayApiUnitResponse>;
  deleteWikiPageComment(wikiId: string, pageId: string, commentId: string): Promise<DoorayApiUnitResponse>;
}
