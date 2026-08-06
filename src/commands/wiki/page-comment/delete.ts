import { Command } from "commander";
import { getConfigOrThrow } from "../../../config/store.js";
import { DoorayApiClient } from "../../../api/client.js";
import { resolveWikiPageInput } from "../../../resolvers/wiki-page-input.js";
import { startSpinner, stopSpinner } from "../../../utils/spinner.js";
import { parseWikiCommentArgs } from "./parse-args.js";
import {
  authorizeDeletion,
  promptDeletion,
} from "../../../utils/delete-confirmation.js";

export const wikiPageCommentDeleteCommand = new Command("delete")
  .description("위키 페이지 댓글 삭제")
  .argument("[arg1]", "프로젝트 코드 / Dooray Wiki URL (모드별)")
  .argument("[arg2]", "위키 페이지 ID (모드별)")
  .argument("[arg3]", "댓글 ID (positional 3개 모드)")
  .option("--id <pageId>", "위키 페이지 ID (positional 대신)")
  .option("--url <url>", "Dooray Wiki URL (positional 대신)")
  .option("--project <code>", "프로젝트 코드 (--id 모드용)")
  .option("--comment-id <commentId>", "댓글 ID (positional 대체)")
  .option("-y, --yes", "확인 없이 삭제 (자동화용)")
  .action(async (arg1, arg2, arg3, opts) => {
    const confirmed = await authorizeDeletion(
      !!opts.yes,
      !!process.stdin.isTTY,
      () => promptDeletion("위키 페이지의 댓글을 영구 삭제할까요?"),
    );
    if (!confirmed) {
      process.stderr.write("취소되었습니다.\n");
      return;
    }

    const parsed = parseWikiCommentArgs(arg1, arg2, arg3, opts);

    const config = await getConfigOrThrow();
    const client = new DoorayApiClient(config.apiKey, config.baseUrl);

    const { wikiId, pageId } = await resolveWikiPageInput(client, {
      projectArg: parsed.projectArg,
      pageIdArg: parsed.pageIdArg,
      idOpt: parsed.idOpt,
      urlOpt: parsed.urlOpt,
      project: parsed.projectOpt,
    });

    startSpinner("댓글 삭제 중...");
    try {
      await client.deleteWikiPageComment(wikiId, pageId, parsed.commentId);
      stopSpinner(true, "삭제 완료");
      process.stdout.write(`댓글(${parsed.commentId})이 삭제되었습니다.\n`);
    } catch (e) {
      stopSpinner(false);
      throw e;
    }
  });
