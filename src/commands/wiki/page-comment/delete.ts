import { Command } from "commander";
import { getConfigOrThrow } from "../../../config/store.js";
import { DoorayApiClient } from "../../../api/client.js";
import { resolveWikiPageInput } from "../../../resolvers/wiki-page-input.js";
import { startSpinner, stopSpinner } from "../../../utils/spinner.js";
import { DoorayCliError } from "../../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../../utils/exit-codes.js";

export const wikiPageCommentDeleteCommand = new Command("delete")
  .description("위키 페이지 댓글 삭제 (confirm 없이 즉시)")
  .argument("[arg1]", "프로젝트 코드 / Dooray Wiki URL (모드별)")
  .argument("[arg2]", "위키 페이지 ID (모드별)")
  .argument("[arg3]", "댓글 ID (positional 3개 모드)")
  .option("--id <pageId>", "위키 페이지 ID (positional 대신)")
  .option("--url <url>", "Dooray Wiki URL (positional 대신)")
  .option("--project <code>", "프로젝트 코드 (--id 모드용)")
  .option("--comment-id <commentId>", "댓글 ID (positional 대체)")
  .action(async (arg1, arg2, arg3, opts) => {
    const config = await getConfigOrThrow();
    const client = new DoorayApiClient(config.apiKey, config.baseUrl);

    let projectArg: string | undefined;
    let pageIdArg: string | undefined;
    let commentId: string | undefined = opts.commentId;
    let idOpt: string | undefined;
    let urlOpt: string | undefined;
    let projectOpt: string | undefined;

    if (opts.id || opts.url) {
      if (arg2 || arg3) {
        throw new DoorayCliError(
          "--id/--url 모드에서는 댓글 ID 외 추가 positional 인자를 받지 않습니다. --comment-id 옵션 사용을 권장합니다.",
          EXIT_PARAM_ERROR,
        );
      }
      commentId = commentId ?? arg1;
      idOpt = opts.id;
      urlOpt = opts.url;
      projectOpt = opts.project;
    } else if (arg3) {
      projectArg = arg1;
      pageIdArg = arg2;
      commentId = commentId ?? arg3;
    } else if (arg1 && arg2 && opts.commentId) {
      projectArg = arg1;
      pageIdArg = arg2;
    } else {
      throw new DoorayCliError(
        "<comment-id>가 필요합니다. positional 3번째 또는 --comment-id 옵션을 사용하세요.",
        EXIT_PARAM_ERROR,
      );
    }

    if (!commentId) {
      throw new DoorayCliError("<comment-id>가 필요합니다.", EXIT_PARAM_ERROR);
    }

    const { wikiId, pageId } = await resolveWikiPageInput(client, {
      projectArg,
      pageIdArg,
      idOpt,
      urlOpt,
      project: projectOpt,
    });

    startSpinner("댓글 삭제 중...");
    try {
      await client.deleteWikiPageComment(wikiId, pageId, commentId);
      stopSpinner(true, "삭제 완료");
      process.stdout.write(`댓글(${commentId})이 삭제되었습니다.\n`);
    } catch (e) {
      stopSpinner(false);
      throw e;
    }
  });
