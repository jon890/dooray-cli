/**
 * 본문의 업무 링크를 업무 조회로 대조하고, 고칠 수 있는 것은 고친 본문을 돌려준다 (ADR-085).
 *
 * 문자열 판정은 `body/link-check.ts` 가 맡는다. 이 파일은 조회만 더한다. 쓰기는 하지 않는다.
 */

import type { PostClient, PostDetail } from "@/api/post/types.js";
import {
  applyReplacements,
  buildDoorayTaskLink,
  escapeBrackets,
  findTaskLinks,
  hasUnescapedBrackets,
  parseLinkTextRef,
  type BodyReplacement,
} from "@/body/link-check.js";

export type LinkIssueKind = "bracket" | "web-url" | "number-mismatch";

export interface LinkIssue {
  kinds: LinkIssueKind[];
  /** 본문에 있던 링크 그대로. */
  original: string;
  /** 고친 꼴 한 줄. 번호가 다르면 그 postId 의 실제 업무로 만든 링크다. */
  suggestion: string;
  message: string;
  /** `--fix-links` 로 고칠 수 있는지. 번호 불일치와, 조회하지 못한 웹 주소는 고칠 수 없다. */
  fixable: boolean;
}

export interface LinkCheckResult {
  /** 고칠 수 있는 문제를 고친 본문. `fix` 가 거짓이면 입력 그대로다. */
  body: string;
  /** 보내기 전에 멈춰야 하는 문제. `fix` 가 참이면 고치지 못한 것만 남는다. */
  errors: LinkIssue[];
  /** `fix` 로 고친 문제. */
  fixed: LinkIssue[];
  warnings: string[];
}

export interface LinkCheckOptions {
  orgId: string;
  tenantName?: string;
  fix: boolean;
}

/** 업무 링크가 하나도 없으면 조회하지 않는다. */
export function hasTaskLinks(body: string, tenantName?: string): boolean {
  return findTaskLinks(body, tenantName).length > 0;
}

export async function checkTaskLinks(
  client: Pick<PostClient, "getPostStandalone">,
  body: string,
  opts: LinkCheckOptions,
): Promise<LinkCheckResult> {
  const links = findTaskLinks(body, opts.tenantName);
  const warnings: string[] = [];
  const posts = await lookupPosts(client, [...new Set(links.map((l) => l.postId))], warnings);

  const errors: LinkIssue[] = [];
  const fixed: LinkIssue[] = [];
  const replacements: BodyReplacement[] = [];

  for (const link of links) {
    const kinds: LinkIssueKind[] = [];
    const reasons: string[] = [];
    const post = posts.get(link.postId);

    if (hasUnescapedBrackets(link.text)) {
      kinds.push("bracket");
      reasons.push("표시 글의 대괄호를 &#91; &#93; 로 바꾸지 않았습니다");
    }
    if (link.kind === "web") {
      kinds.push("web-url");
      reasons.push("업무 웹 주소 대신 dooray://<orgId>/tasks/<postId> \"<workflow>\" 꼴을 씁니다");
    }

    const textRef = parseLinkTextRef(link.text);
    const mismatch =
      post != null && textRef != null &&
      (textRef.projectCode !== post.project.code || textRef.number !== post.number);
    if (mismatch) {
      kinds.push("number-mismatch");
      reasons.push(
        `표시 글은 ${textRef.projectCode}/${textRef.number} 인데 postId ${link.postId} 는 ` +
          `${post.project.code}/${post.number} 업무입니다. postId 를 확인합니다`,
      );
    }

    if (kinds.length === 0) continue;

    const fixedText = escapeBrackets(link.text);
    const fixedLink =
      link.kind === "web"
        ? buildDoorayTaskLink(fixedText, opts.orgId, link.postId, post?.workflowClass)
        : link.title !== undefined
          ? `[${fixedText}](${link.url} "${link.title}")`
          : `[${fixedText}](${link.url})`;
    const suggestion = mismatch && post
      ? buildDoorayTaskLink(
          `${post.project.code}/${post.number} ${escapeBrackets(post.subject)}`,
          opts.orgId,
          post.id,
          post.workflowClass,
        )
      : fixedLink;
    // 웹 주소를 조회하지 못하면 workflow 를 모르고 postId 가 맞는지도 모른다. 추측해 고치지 않는다.
    const webUnresolved = link.kind === "web" && post == null;
    if (webUnresolved) reasons.push("업무를 조회하지 못해 자동으로 고치지 않습니다");
    const fixable = !mismatch && !webUnresolved;

    const issue: LinkIssue = {
      kinds,
      original: link.raw,
      suggestion,
      message: reasons.join(". "),
      fixable,
    };
    if (opts.fix && fixable) {
      fixed.push(issue);
      replacements.push({ start: link.start, end: link.end, replacement: fixedLink });
    } else {
      errors.push(issue);
    }
  }

  return { body: applyReplacements(body, replacements), errors, fixed, warnings };
}

async function lookupPosts(
  client: Pick<PostClient, "getPostStandalone">,
  postIds: string[],
  warnings: string[],
): Promise<Map<string, PostDetail>> {
  const entries = await Promise.all(
    postIds.map(async (postId) => {
      try {
        const res = await client.getPostStandalone(postId);
        return [postId, res.result] as const;
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        warnings.push(`업무 링크의 postId ${postId} 를 조회하지 못해 번호를 확인하지 않았습니다: ${reason}`);
        return null;
      }
    }),
  );
  return new Map(entries.filter((e): e is readonly [string, PostDetail] => e != null));
}
