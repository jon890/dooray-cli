import { Command } from "commander";
import { getConfigOrThrow } from "../../../config/store.js";
import { DoorayApiClient } from "../../../api/client.js";
import { resolvePostInput } from "../../../resolvers/post-input.js";
import { buildMemberNameMap } from "../../../resolvers/member.js";
import { enrichCommentCreators } from "../../../utils/comment-enrich.js";
import { formatCommentList } from "../../../formatters/post.js";
import type { OutputOptions } from "../../../formatters/table.js";
import { startSpinner, stopSpinner } from "../../../utils/spinner.js";
import { DoorayCliError } from "../../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../../utils/exit-codes.js";

export const commentLatestCommand = new Command("latest")
  .description("최신 댓글 1개 조회 (= comment list --latest 1)")
  .argument("[project]", "프로젝트 코드 (또는 첫 인자에 Dooray URL)")
  .argument("[post-number]", "업무 번호 (project와 함께 사용)")
  .option("--id <postId>", "Dooray post ID (project/post-number 대신)")
  .option("--url <url>", "Dooray 업무 URL (project/post-number 대신)")
  .option("-n, --count <n>", "최신 N개 (기본 1)", "1")
  .action(async (project, postNumberStr, opts) => {
    const globalOpts = commentLatestCommand.optsWithGlobals() as OutputOptions;
    const config = await getConfigOrThrow();
    const client = new DoorayApiClient(config.apiKey, config.baseUrl);

    // MEDIUM-3: --count 검증 (spinner 시작 전)
    const n = Number(opts.count);
    if (!Number.isFinite(n) || n <= 0) {
      throw new DoorayCliError("--count는 양의 정수여야 합니다.", EXIT_PARAM_ERROR);
    }
    if (n > 100) {
      throw new DoorayCliError("--count는 최대 100까지 지원합니다.", EXIT_PARAM_ERROR);
    }

    startSpinner("최신 댓글 조회 중...");
    const { projectId, postId } = await resolvePostInput(client, {
      projectArg: project,
      postNumberArg: postNumberStr,
      idOpt: opts.id,
      urlOpt: opts.url,
    });
    const res = await client.getPostComments(projectId, postId, {
      page: 0, size: Math.min(n, 100), order: "-createdAt",
    });
    stopSpinner(true, "조회 완료");

    let comments = res.result.slice(0, n);
    if (!globalOpts.json) {
      let nameMap = new Map<string, string>();
      try { nameMap = await buildMemberNameMap(client, projectId); } catch { /* enrich 실패 시 무시 */ }
      comments = enrichCommentCreators(comments, nameMap);
    }
    formatCommentList(comments, globalOpts);
  });
