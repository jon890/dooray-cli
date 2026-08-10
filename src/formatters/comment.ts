import type { PostComment } from "../api/types.js";
import type { OutputOptions } from "./table.js";
import { printJson, printTable } from "./table.js";
import { formatSize } from "../utils/format-size.js";

// table 모드: 메타 (Field/Value) → 본문 → attachments (있으면)
// JSON 모드: printJson(comment)
// quiet 모드: id 만 stdout
export function formatCommentDetail(comment: PostComment, opts: OutputOptions): void {
  if (opts.json) { printJson(comment); return; }
  if (opts.quiet) { process.stdout.write(comment.id + "\n"); return; }

  const metaRows: string[][] = [
    ["ID", comment.id],
    ["작성자", comment.creator.member?.name ?? ""],
    ["생성", comment.createdAt],
    ...(comment.modifiedAt ? [["수정", comment.modifiedAt]] : []),
    ["mimeType", comment.body.mimeType],
  ];
  printTable(["Field", "Value"], metaRows);

  process.stdout.write("\n" + comment.body.content + "\n");

  if (comment.files && comment.files.length > 0) {
    process.stdout.write("\n[Attachments]\n");
    printTable(
      ["Name", "Size", "ID"],
      comment.files.map((f) => [f.name ?? "-", formatSize(f.size), f.id]),
    );
  }
}
