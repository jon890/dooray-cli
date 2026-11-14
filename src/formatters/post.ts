import type { Post, PostDetail, PostComment } from "@/api/post/types.js";
import type { OutputOptions } from "./table.js";
import { output, printJson } from "./table.js";

export function formatPostList(posts: Post[], opts: OutputOptions): void {
  output(opts, {
    headers: ["Number", "Subject", "Workflow", "Priority", "Assignee"],
    rows: posts.map((p) => [
      String(p.number),
      p.subject,
      p.workflow.name,
      p.priority,
      p.users.to.map((u) => u.member?.name ?? u.emailUser?.name ?? "").filter(Boolean).join(", "),
    ]),
    raw: posts,
    ids: posts.map((p) => String(p.number)),
  });
}

/** 업무 상세 출력에 쓰는 태그 한 건. `name` 은 찾지 못하면 키 자체를 넣지 않는다 (ADR-056) */
export interface PostDetailTag {
  id: string;
  name?: string;
}

/**
 * 업무 상세를 출력한다.
 *
 * `tags` 는 이름을 붙인 태그 목록이다. 포맷터가 API 를 부르지 않도록 밖에서 받는다.
 * `--json` 은 이 인자가 있을 때만 응답의 `tags` 를 그것으로 바꾼다.
 * 없으면 응답을 그대로 낸다 — `--json` 의 raw 유지 기본이다 (ADR-056).
 */
export function formatPostDetail(
  post: PostDetail,
  opts: OutputOptions,
  tags?: PostDetailTag[],
): void {
  if (opts.json) {
    printJson(tags ? { ...post, tags } : post);
    return;
  }

  // 태그가 없으면 줄 자체를 내지 않는다. 빈 줄을 내면 태그 없는 업무마다 의미 없는 줄이 생긴다.
  const tagLine = tags && tags.length > 0
    ? `태그: ${tags.map((t) => (t.name ? t.name : `${t.id} (이름 없음)`)).join(", ")}`
    : null;

  const lines: string[] = [
    `#${post.number} ${post.subject}`,
    `프로젝트: ${post.project.code}`,
    `상태: ${post.workflow.name} (${post.workflowClass})`,
    `우선순위: ${post.priority}`,
    `작성자: ${post.users.from.member?.name ?? ""}`,
    `담당자: ${post.users.to.map((u) => u.member?.name ?? "").filter(Boolean).join(", ")}`,
    ...(tagLine ? [tagLine] : []),
    `생성: ${post.createdAt}`,
    `수정: ${post.updatedAt}`,
    "",
    post.body.content,
  ];
  process.stdout.write(lines.join("\n") + "\n");
}

export function formatCommentList(comments: PostComment[], opts: OutputOptions): void {
  output(opts, {
    headers: ["ID", "Creator", "Body", "Created"],
    rows: comments.map((c) => [
      c.id,
      c.creator.member?.name ?? "",
      c.body.content.length > 60 ? c.body.content.slice(0, 57) + "..." : c.body.content,
      c.createdAt,
    ]),
    raw: comments,
    ids: comments.map((c) => c.id),
  });
}
