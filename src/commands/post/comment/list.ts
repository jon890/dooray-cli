import { Command } from "commander";
import { getConfigOrThrow } from "../../../config/store.js";
import { DoorayApiClient } from "../../../api/client.js";
import { resolvePostInput } from "../../../resolvers/post-input.js";
import { buildMemberNameMap } from "../../../resolvers/member.js";
import { enrichCommentCreators } from "../../../utils/comment-enrich.js";
import { formatCommentList } from "../../../formatters/post.js";
import type { OutputOptions } from "../../../formatters/table.js";
import { startSpinner, stopSpinner } from "../../../utils/spinner.js";

export const commentListCommand = new Command("list")
  .description("댓글 목록 조회")
  .argument("[project]", "프로젝트 코드 (또는 첫 인자에 Dooray URL)")
  .argument("[post-number]", "업무 번호 (project와 함께 사용)")
  .option("--id <postId>", "Dooray post ID (project/post-number 대신)")
  .option("--url <url>", "Dooray 업무 URL (project/post-number 대신)")
  .option("--page <number>", "페이지 번호", "0")
  .option("--size <number>", "페이지 크기", "20")
  .action(async (project, postNumberStr, opts) => {
    const globalOpts = commentListCommand.optsWithGlobals() as OutputOptions;
    const config = await getConfigOrThrow();
    const client = new DoorayApiClient(config.apiKey, config.baseUrl);

    startSpinner("댓글 목록 조회 중...");
    const { projectId, postId } = await resolvePostInput(client, {
      projectArg: project,
      postNumberArg: postNumberStr,
      idOpt: opts.id,
      urlOpt: opts.url,
    });
    const res = await client.getPostComments(projectId, postId, {
      page: Number(opts.page),
      size: Number(opts.size),
    });
    stopSpinner(true, "댓글 목록 조회 완료");

    let comments = res.result;
    if (!globalOpts.json) {
      // table/quiet 출력일 때만 enrich (--json은 raw 유지 — ADR-021)
      let nameMap = new Map<string, string>();
      try {
        nameMap = await buildMemberNameMap(client, projectId);
      } catch { /* enrich 실패 시 빈 map → 표시명 비어있음, 명령은 정상 동작 */ }
      comments = enrichCommentCreators(comments, nameMap);
    }
    formatCommentList(comments, globalOpts);
  });
