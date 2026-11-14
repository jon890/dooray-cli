/**
 * 위키 웹 경로와 공식 응답 변환. 경로·쿼리·실측은 docs/api/web-endpoints/wiki.md 가 소유한다.
 * 웹은 같은 부모 아래 같은 제목을 거절하지 않고 ` (1)` 을 붙여 저장하므로(공식 API 는 409),
 * 쓰기 전에 형제 제목을 확인하고 쓴 뒤 저장된 제목을 비교한다.
 */
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { WikiClient } from "./types.js";
import type { WikiPage, WikiPageDetail, WikiPageFile, WikiPageFileType, WikiComment, Wiki } from "./types.js";
import type { DoorayApiUnitResponse } from "@/api/common/types.js";
import { apiPath } from "../api-path.js";
import { count, date, identifier, invalidResponse, row, rows, text, type Row } from "../web/convert.js";
import type { WebContext } from "../web/context.js";
import type { WebEnvelope } from "../web/http.js";
import { DoorayCliError } from "../../utils/errors.js";
import { EXIT_API_ERROR, EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
import { fallbackFileName, parseContentDispositionFileName } from "../../utils/content-disposition.js";

const MARKDOWN = "text/x-markdown";
const WEB_UNSUPPORTED = "웹 방식에서는 지원하지 않습니다. auth-mode 를 api-key 로 바꾸세요.";
/** 확인한 값이다. 서버가 허용하는 최대치는 알 수 없다. */
const MAX_COMMENT_WINDOW = 1000;
const DEFAULT_COMMENT_SIZE = 20;

function unsupported(reason: string): DoorayCliError {
  return new DoorayCliError(`${reason} ${WEB_UNSUPPORTED}`, EXIT_PARAM_ERROR);
}

function assertMarkdown(mimeType: string | undefined): void {
  if (mimeType !== undefined && mimeType !== MARKDOWN) throw unsupported(`웹은 본문 형식으로 ${MARKDOWN} 만 받습니다.`);
}

function member(id: unknown): { type: "member"; member: { organizationMemberId: string } } {
  return { type: "member", member: { organizationMemberId: identifier(id) } };
}

function content(response: WebEnvelope): Row {
  return row(row(response.result).content);
}

const unit = (response: WebEnvelope): DoorayApiUnitResponse => ({ header: response.header, result: null });

function pageSummary(source: Row): WikiPage {
  const out = {
    id: identifier(source.pageId), wikiId: identifier(source.wikiId), version: count(source.version),
    root: typeof source.root === "boolean" ? source.root : invalidResponse(), subject: text(source.subject),
  } as WikiPage;
  if (source.createOrganizationMemberId !== undefined && source.createOrganizationMemberId !== null) out.creator = member(source.createOrganizationMemberId);
  if (source.parentPageId !== undefined && source.parentPageId !== null) out.parentPageId = identifier(source.parentPageId);
  return out;
}

function fileList(value: unknown): WikiPageFile[] {
  return rows(value).map((source) => ({
    id: identifier(source.id), name: text(source.name), size: count(source.size),
    ...(source.attachFileId !== undefined && source.attachFileId !== null && { attachFileId: identifier(source.attachFileId) }),
  }));
}

function pageDetail(source: Row): WikiPageDetail {
  const body = row(source.body);
  const out = {
    id: identifier(source.pageId), wikiId: identifier(source.wikiId), version: count(source.version),
    root: typeof source.root === "boolean" ? source.root : invalidResponse(), subject: text(source.subject),
    body: { mimeType: text(body.mimeType), content: text(body.content) },
    files: fileList(source.files ?? []), images: fileList(source.images ?? []),
  } as WikiPageDetail;
  if (source.parentPageId !== undefined && source.parentPageId !== null) out.parentPageId = identifier(source.parentPageId);
  if (source.create !== undefined && source.create !== null) {
    const create = row(source.create);
    out.creator = member(row(create.member).organizationMemberId);
    const createdAt = date(create.dateTime ?? null);
    if (createdAt) out.createdAt = createdAt;
  }
  if (source.lastUpdate !== undefined && source.lastUpdate !== null) {
    const updatedAt = date(row(source.lastUpdate).dateTime ?? null);
    if (updatedAt) out.updatedAt = updatedAt;
  }
  if (source.referrers !== undefined && source.referrers !== null) {
    out.referrers = rows(source.referrers).map((r) => member(r.organizationMemberId));
  }
  return out;
}

function comment(source: Row): WikiComment {
  const creator = row(source.creator);
  const out = {
    id: identifier(source.pageCommentId), page: { id: identifier(source.pageId) },
    createdAt: date(source.createdAt) ?? invalidResponse(),
    creator: { type: "member", member: { organizationMemberId: identifier(creator.organizationMemberId), name: text(creator.name) } },
    body: { mimeType: text(row(source.body).mimeType), content: text(row(source.body).content) },
  } as WikiComment;
  if (source.modifiedAt !== undefined && source.modifiedAt !== null) {
    const modifiedAt = date(source.modifiedAt);
    if (modifiedAt) out.modifiedAt = modifiedAt;
  }
  return out;
}

interface CachedPage { detail: WikiPageDetail; fileNames: Map<string, string> }

export function createWikiWeb(context: WebContext): WikiClient {
  const http = context.http;
  // 한 실행 안에서만 쓴다. download-all 이 파일마다 페이지 상세를 다시 읽지 않게 한다.
  // 키는 응답의 pageId 다. 같은 페이지를 위키 id 로도 --url 의 프로젝트 id 로도 부를 수 있어 wikiId 를 키에 넣으면 갈린다.
  const pages = new Map<string, CachedPage>();

  const client: WikiClient = {
    async getWikis(params) {
      const response = await http.request("v2/wapi/wikis", { searchParams: { ...(params?.page != null && { page: params.page }), ...(params?.size != null && { size: params.size }) } });
      const result = row(response.result);
      const wikis: Wiki[] = rows(result.contents).map((source) => {
        const home = row(source.home);
        return { id: identifier(source.id), project: { id: identifier(source.projectId) }, name: text(source.name), type: text(source.type), scope: text(source.scope), home: { pageId: identifier(home.pageId) } };
      });
      return { header: response.header, result: wikis, totalCount: count(result.totalCount) };
    },

    async getWikiPages(wikiId, parentPageId) {
      const response = await http.request(apiPath`v2/wapi/wikis/${wikiId}/pages`, { searchParams: parentPageId ? { parentPageId } : {} });
      return { header: response.header, result: rows(row(response.result).contents).map(pageSummary) };
    },

    async getWikiPage(wikiId, pageId) {
      const response = await http.request(apiPath`v2/wapi/wikis/${wikiId}/pages/${pageId}`);
      const detail = pageDetail(content(response));
      pages.set(pageId, { detail, fileNames: new Map([...(detail.files ?? []), ...(detail.images ?? [])].map((f) => [f.id, f.name])) });
      return { header: response.header, result: detail };
    },

    async getWikiPageStandalone(pageId) {
      const light = await http.request(apiPath`v2/wapi/pages/${pageId}`);
      return client.getWikiPage(identifier(content(light).wikiId), pageId);
    },

    async createWikiPage(wikiId, body) {
      assertMarkdown(body.body.mimeType);
      await assertNoSiblingTitle(wikiId, body.parentPageId, body.subject);
      const response = await http.request(apiPath`v2/wapi/wikis/${wikiId}/pages`, { method: "POST", json: body });
      const created = row(response.result);
      const id = identifier(created.pageId);
      await warnIfTitleChanged(wikiId, id, body.subject);
      return { header: response.header, result: { id, wikiId: identifier(created.wikiId), ...(created.parentPageId != null && { parentPageId: identifier(created.parentPageId) }), version: count(created.version) } };
    },

    async updateWikiPage(wikiId, pageId, body) {
      // 웹은 제목과 본문을 둘 다 요구한다. 하나만 보내면 400/500 이라 호출 전에 막는다.
      if (body.subject === undefined || body.body === undefined) throw unsupported("웹은 페이지 수정에 제목과 본문을 함께 받습니다.");
      assertMarkdown(body.body.mimeType);
      await assertTitleChangeAllowed(wikiId, pageId, body.subject);
      const response = await http.request(apiPath`v2/wapi/wikis/${wikiId}/pages/${pageId}`, { method: "PUT", json: body });
      pages.delete(pageId);
      await warnIfTitleChanged(wikiId, pageId, body.subject);
      return unit(response);
    },

    async updateWikiPageTitle(wikiId, pageId, body) {
      await assertTitleChangeAllowed(wikiId, pageId, body.subject);
      const response = await http.request(apiPath`v2/wapi/wikis/${wikiId}/pages/${pageId}/title`, { method: "PUT", json: body });
      pages.delete(pageId);
      const stored = row(response.result).title;
      if (typeof stored === "string" && stored !== body.subject) warnTitleChanged(stored);
      return unit(response);
    },

    async updateWikiPageContent(wikiId, pageId, body) {
      assertMarkdown(body.body.mimeType);
      const response = await http.request(apiPath`v2/wapi/wikis/${wikiId}/pages/${pageId}/content`, { method: "PUT", json: body });
      pages.delete(pageId);
      return unit(response);
    },

    async deleteWikiPage(wikiId, pageId) {
      const response = await http.request(apiPath`v2/wapi/wikis/${wikiId}/pages/${pageId}`, { method: "DELETE" });
      pages.delete(pageId);
      return unit(response);
    },

    async moveWikiPage(wikiId, pageId, body) {
      // 웹의 이동은 요청 본문이 아니라 쿼리다. 다른 위키로 옮기는 경로는 실측하지 못했다.
      if (body.targetWikiId !== undefined) throw unsupported("웹에서 다른 위키로 옮기는 경로는 확인하지 못했습니다.");
      const searchParams: Record<string, string> = { targetParentPageId: body.targetParentPageId };
      if (body.beforePageId !== undefined) searchParams.beforePageId = body.beforePageId;
      if (body.withChildren === false) searchParams.withChildren = "false";
      const response = await http.request(apiPath`v2/wapi/wikis/${wikiId}/pages/${pageId}/move`, { method: "POST", searchParams });
      pages.delete(pageId);
      return unit(response);
    },

    async uploadWikiPageFile(wikiId, pageId, filePath, type) {
      const buffer = await readFile(filePath);
      // ADR-029: type 필드를 file 필드보다 먼저 append (Dooray 서버 순서 의존)
      const form = new FormData();
      form.append("type", type);
      form.append("file", new Blob([buffer]), basename(filePath));
      const response = await http.upload(apiPath`v2/wapi/wikis/${wikiId}/pages/${pageId}/files`, form);
      pages.delete(pageId);
      const source = row(response.result);
      const fileType = text(source.type);
      if (fileType !== "general" && fileType !== "inline_image") return invalidResponse();
      return { header: response.header, result: { id: identifier(source.id), attachFileId: identifier(source.attachFileId), name: text(source.name), mimeType: text(source.mimeType), type: fileType as WikiPageFileType, size: count(source.size), createdAt: date(source.createdAt) ?? invalidResponse() } };
    },

    async downloadWikiPageFile(wikiId, pageId, fileId, knownName) {
      const listName = await pageFileName(wikiId, pageId, fileId);
      // 경로는 응답의 downloadUrl 문자열이 아니라 fileId 로 만든다(ADR-067).
      const response = await http.requestBytes(apiPath`page-files/${fileId}`);
      const disposition = response.headers.get("content-disposition");
      const fileName = parseContentDispositionFileName(disposition) ?? fallbackFileName(fileId, knownName ?? listName, disposition);
      return { buffer: await response.arrayBuffer(), fileName };
    },

    async deleteWikiPageFile(wikiId, pageId, fileId) {
      await pageFileName(wikiId, pageId, fileId);
      const response = await http.request(apiPath`v2/wapi/wikis/${wikiId}/page-files/${fileId}`, { method: "DELETE" });
      pages.delete(pageId);
      return unit(response);
    },

    async getWikiPageComments(wikiId, pageId, params) {
      const page = params?.page ?? 0, size = params?.size ?? DEFAULT_COMMENT_SIZE;
      if (!Number.isSafeInteger(page) || !Number.isSafeInteger(size) || page < 0 || size < 1) throw new DoorayCliError("댓글 page·size 값이 올바르지 않습니다.", EXIT_PARAM_ERROR);
      // 웹은 page 를 무시하고 size 만큼 가장 최근 댓글을 오래된 것부터 준다. 공식 순서(최신순, page 단위)는 뒤집어 자른다.
      const window = (page + 1) * size;
      if (window > MAX_COMMENT_WINDOW) throw unsupported(`웹은 댓글을 (page+1)×size 가 ${MAX_COMMENT_WINDOW} 이하일 때만 확인했습니다.`);
      const response = await http.request(apiPath`v2/wapi/wikis/${wikiId}/pages/${pageId}/comments`, { searchParams: { size: window } });
      const result = row(response.result);
      const newestFirst = rows(result.contents).map(comment).reverse();
      return { header: response.header, result: newestFirst.slice(page * size, window), totalCount: count(result.totalCount) };
    },

    async getWikiPageComment(wikiId, pageId, commentId) {
      const response = await http.request(apiPath`v2/wapi/wikis/${wikiId}/pages/${pageId}/comments/${commentId}`);
      return { header: response.header, result: comment(content(response)) };
    },

    async addWikiPageComment(wikiId, pageId, body) {
      const response = await http.request(apiPath`v2/wapi/wikis/${wikiId}/pages/${pageId}/comments`, { method: "POST", json: { body: { content: body.body.content, mimeType: MARKDOWN }, attachFileIds: [] } });
      return { header: response.header, result: { id: identifier(row(response.result).pageCommentId) } };
    },

    async updateWikiPageComment(wikiId, pageId, commentId, body) {
      const response = await http.request(apiPath`v2/wapi/wikis/${wikiId}/pages/${pageId}/comments/${commentId}`, { method: "PUT", json: { body: { content: body.body.content, mimeType: MARKDOWN }, attachFileIds: [] } });
      return unit(response);
    },

    async deleteWikiPageComment(wikiId, pageId, commentId) {
      return unit(await http.request(apiPath`v2/wapi/wikis/${wikiId}/pages/${pageId}/comments/${commentId}`, { method: "DELETE" }));
    },
  };

  /** 파일이 이 페이지의 것인지 페이지 상세로 확인하고 상세의 파일 이름을 돌려준다. 경로에 페이지 id 가 없어 다른 페이지의 파일을 건드리지 않게 하는 확인이다. */
  async function pageFileName(wikiId: string, pageId: string, fileId: string): Promise<string> {
    let cached = pages.get(pageId);
    if (!cached) {
      await client.getWikiPage(wikiId, pageId);
      cached = pages.get(pageId);
    }
    const name = cached?.fileNames.get(fileId);
    if (name === undefined) throw new DoorayCliError("이 페이지에 없는 파일입니다.", EXIT_API_ERROR);
    return name;
  }

  /** 공식 API 는 같은 부모 아래 같은 제목을 409 로 거절한다. 웹은 거절하지 않으므로 같은 결과로 맞춘다. 제목은 메시지에 넣지 않는다. */
  async function assertNoSiblingTitle(wikiId: string, parentPageId: string | undefined, subject: string, exceptPageId?: string): Promise<void> {
    if (!parentPageId) return;
    const siblings = (await client.getWikiPages(wikiId, parentPageId)).result;
    if (siblings.some((s) => s.subject === subject && s.id !== exceptPageId)) {
      throw new DoorayCliError("같은 위치에 같은 제목의 페이지가 있습니다.", EXIT_API_ERROR);
    }
  }

  async function assertTitleChangeAllowed(wikiId: string, pageId: string, subject: string): Promise<void> {
    const current = (await client.getWikiPage(wikiId, pageId)).result;
    if (current.subject === subject) return;
    await assertNoSiblingTitle(wikiId, current.parentPageId, subject, pageId);
  }

  /** 확인과 쓰기 사이의 경쟁이나 권한 때문에 서버가 제목을 바꿔 저장했을 수 있다. 저장된 제목을 보인다. */
  async function warnIfTitleChanged(wikiId: string, pageId: string, requested: string): Promise<void> {
    // 쓰기는 이미 끝났다. 확인 읽기가 실패해도 명령을 실패시키면 다시 실행한 사용자가 같은 제목 확인에 걸린다.
    try {
      const stored = (await client.getWikiPage(wikiId, pageId)).result.subject;
      if (stored !== requested) warnTitleChanged(stored);
    } catch {
      process.stderr.write("⚠  저장은 끝났지만 저장된 제목을 확인하지 못했습니다.\n");
    }
  }

  return client;
}

function warnTitleChanged(stored: string): void {
  process.stderr.write(`⚠  서버가 같은 제목을 피해 제목을 바꿔 저장했습니다. 저장된 제목: ${stored}\n`);
}
