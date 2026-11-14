/**
 * 업무 댓글 한 건을 찾고 작성자 이름을 채운다. `post comment get` 이 쓴다.
 */

import type { PostComment } from "@/api/post/types.js";
import type { PostClient } from "@/api/post/types.js";
import type { MemberClient } from "@/api/member/types.js";
import type { ProjectClient } from "@/api/project/types.js";
import { enrichCommentCreators } from "@/formatters/comment-enrich.js";
import { buildMemberNameMap } from "../../../resolvers/member.js";
import { resolvePostInput } from "../../../resolvers/post-input.js";

export interface CommentLookupArgs {
  projectArg?: string;
  postNumberArg?: string;
  commentId: string;
  idOpt?: string;
  urlOpt?: string;
}

/** 입력으로 업무를 풀고 댓글 한 건을 조회한다. 작성자 이름은 채우지 않은 서버 응답 그대로다. */
export async function fetchPostComment(
  client: PostClient & ProjectClient,
  args: CommentLookupArgs,
  argv: string[],
): Promise<{ projectId: string; comment: PostComment }> {
  const resolved = await resolvePostInput(client, {
    projectArg: args.projectArg,
    postNumberArg: args.postNumberArg,
    idOpt: args.idOpt,
    urlOpt: args.urlOpt,
    argv,
  });
  const detail = await client.getPostComment(resolved.projectId, resolved.postId, args.commentId);
  return { projectId: resolved.projectId, comment: detail.result };
}

/**
 * 작성자 이름을 채운 댓글. 이름 조회가 실패하면 이름 없이 돌려준다(comment list 와 같은 정책).
 * `--json` 은 서버 응답 원형을 지켜야 하므로 부르는 쪽이 이 함수를 거치지 않는다.
 */
export async function withCreatorNames(
  client: MemberClient,
  projectId: string,
  comment: PostComment,
): Promise<PostComment> {
  let nameMap = new Map<string, string>();
  try {
    nameMap = await buildMemberNameMap(client, projectId);
  } catch {
    // enrich 실패 시 빈 이름으로 폴백
  }
  return enrichCommentCreators([comment], nameMap)[0]!;
}
