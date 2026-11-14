/** wiki 영역의 DTO·요청 파라미터와 클라이언트 계약이다. */
import type { DoorayApiHeader, DoorayApiResponse, DoorayApiUnitResponse } from "@/api/common/types.js";
import type { Member } from "@/api/common/types.js";

export interface GetWikisParams {
  page?: number;
  size?: number;
}

// ─── Wiki Comment ────────────────────────────────────────

export interface WikiCommentPage {
  id: string;
}

export interface WikiCommentCreator {
  type: string;
  member: {
    organizationMemberId: string;
    name: string;
  };
}

export interface WikiCommentBody {
  mimeType: string;
  content: string;
}

export interface WikiComment {
  id: string;
  page: WikiCommentPage;
  createdAt: string;
  modifiedAt?: string;
  creator: WikiCommentCreator;
  body: WikiCommentBody;
}

export interface CreateWikiCommentRequest {
  body: { content: string };
}

export interface UpdateWikiCommentRequest {
  body: { content: string };
}

export interface WikiCommentListResponse {
  header: DoorayApiHeader;
  result: WikiComment[];
  totalCount: number;
}

export type WikiCommentDetailResponse = DoorayApiResponse<WikiComment>;

export interface CreateWikiCommentResult {
  id: string;
}

export type CreateWikiCommentApiResponse = DoorayApiResponse<CreateWikiCommentResult>;

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

export type WikiListResponse = DoorayApiResponse<Wiki[]> & { totalCount: number };

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
  parentPageId?: string;
}

export type WikiPagesResponse = DoorayApiResponse<WikiPage[]>;

export interface WikiPageBody {
  mimeType: string;
  content?: string;
}

export interface WikiPageFile {
  id: string;
  name: string;
  size: number;
  /**
   * 공식 문서 안에서 서술이 갈린다. `GET /wiki/v1/wikis/{wiki-id}/pages/{page-id}` 응답 예시의 `files[]`·`images[]` 는 `id`·`name`·`size` 만 보이고,
   * `GET /wiki/v1/pages/{page-id}` 예시와 「Attach Files」·「Files」 절은 `$.result.files[].attachFileId` 를 말한다(2026-11-14 확인, ADR-046).
   * 인라인 이미지(`images`)에 붙어 왔고, 본문 참조 `/wikis/<n>/files/<id>` 의 id 는 `id` 가 아니라 이 값이었다 (ADR-065).
   * 첨부 참조 누락 확인에만 쓰며, 없으면 `id` 만으로 확인한다.
   */
  attachFileId?: string;
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
  files?: WikiPageFile[];
  images?: WikiPageFile[];
  referrers?: WikiReferrer[];
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

export interface MoveWikiPageRequest {
  targetParentPageId: string;
  targetWikiId?: string;
  withChildren?: boolean;
  beforePageId?: string;
}

export type WikiPageFileType = "general" | "inline_image";

export interface UploadWikiPageFileResult {
  id: string;
  attachFileId: string;
  name: string;
  mimeType: string;
  type: WikiPageFileType;
  size: number;
  createdAt: string;
}

export type UploadWikiPageFileResponse = DoorayApiResponse<UploadWikiPageFileResult>;

export interface CreateWikiPageResult {
  id: string;
  wikiId: string;
  parentPageId?: string;
  version: number;
}

export type CreateWikiPageResponse = DoorayApiResponse<CreateWikiPageResult>;

export interface WikiClient {
  getWikis(params?: GetWikisParams): Promise<WikiListResponse>;
  getWikiPages(wikiId: string, parentPageId?: string): Promise<WikiPagesResponse>;
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
