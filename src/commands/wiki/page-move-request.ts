/**
 * 위키 페이지 이동 요청 본문을 만든다. `wiki page move` 가 쓴다.
 * 옵션 검증과 출력은 명령 파일이, 요청 본문의 모양은 이 파일이 갖는다.
 */

import type { MoveWikiPageRequest } from "@/api/wiki/types.js";

/** 요청 본문에 영향을 주는 옵션. `parent` 는 검증을 거쳐 반드시 있다. */
export interface MoveRequestOptions {
  parent: string;
  before?: string;
  first?: boolean;
  children?: boolean;
}

export function buildMoveBody(
  opts: MoveRequestOptions,
  resolvedTargetWikiId?: string,
): MoveWikiPageRequest {
  const body: MoveWikiPageRequest = {
    targetParentPageId: opts.parent,
  };

  if (resolvedTargetWikiId) {
    body.targetWikiId = resolvedTargetWikiId;
  }
  if (opts.children === false) {
    body.withChildren = false;
  }
  if (opts.first) {
    body.beforePageId = "0";
  } else if (opts.before) {
    body.beforePageId = opts.before;
  }

  return body;
}
