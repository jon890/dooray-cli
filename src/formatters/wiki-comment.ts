import type { WikiComment } from "../api/types.js";
import type { OutputOptions } from "./table.js";
import { output, printJson, printQuiet } from "./table.js";

export interface FormatWikiCommentOptions {
  globalOpts: OutputOptions;
  totalCount?: number;
}

export function formatWikiCommentList(
  comments: WikiComment[],
  opts: FormatWikiCommentOptions,
): void {
  output(opts.globalOpts, {
    headers: ["ID", "작성자", "생성일", "본문 (요약)"],
    rows: comments.map((c) => [
      c.id,
      c.creator.member.name,
      c.createdAt,
      truncate(c.body.content, 60),
    ]),
    raw: comments,
    ids: comments.map((c) => c.id),
  });
}

export function formatWikiCommentDetail(
  comment: WikiComment,
  globalOpts: OutputOptions,
): void {
  if (globalOpts.json) {
    printJson(comment);
    return;
  }
  if (globalOpts.quiet) {
    printQuiet([comment.id]);
    return;
  }
  process.stdout.write(`ID:       ${comment.id}\n`);
  process.stdout.write(`Page ID:  ${comment.page.id}\n`);
  process.stdout.write(`작성자:   ${comment.creator.member.name}\n`);
  process.stdout.write(`생성일:   ${comment.createdAt}\n`);
  if (comment.modifiedAt && comment.modifiedAt !== comment.createdAt) {
    process.stdout.write(`수정일:   ${comment.modifiedAt}\n`);
  }
  process.stdout.write(`\n${comment.body.content}\n`);
}

function truncate(s: string, n: number): string {
  const oneLine = s.replace(/\s+/g, " ").trim();
  return oneLine.length <= n ? oneLine : oneLine.slice(0, n - 1) + "…";
}
