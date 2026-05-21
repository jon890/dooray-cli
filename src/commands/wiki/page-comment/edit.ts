import { Command } from "commander";
import { getConfigOrThrow } from "../../../config/store.js";
import { DoorayApiClient } from "../../../api/client.js";
import { resolveWikiPageInput } from "../../../resolvers/wiki-page-input.js";
import { openInEditor } from "../../../editor/index.js";
import { readBodyInputOrNull } from "../../../utils/body-input.js";
import { startSpinner, stopSpinner } from "../../../utils/spinner.js";
import { parseWikiCommentArgs } from "./parse-args.js";

export const wikiPageCommentEditCommand = new Command("edit")
  .description("위키 페이지 댓글 수정 ($EDITOR 또는 --body 옵션)")
  .argument("[arg1]", "프로젝트 코드 / Dooray Wiki URL (모드별)")
  .argument("[arg2]", "위키 페이지 ID (모드별)")
  .argument("[arg3]", "댓글 ID (positional 3개 모드)")
  .option("--id <pageId>", "위키 페이지 ID (positional 대신)")
  .option("--url <url>", "Dooray Wiki URL (positional 대신)")
  .option("--project <code>", "프로젝트 코드 (--id 모드용)")
  .option("--comment-id <commentId>", "댓글 ID (positional 대체)")
  .option("--body <text>", "댓글 본문 변경 (- 입력 시 stdin, non-interactive)")
  .option("--body-file <path>", "본문 파일 경로 (- 입력 시 stdin, non-interactive)")
  .action(async (arg1, arg2, arg3, opts) => {
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

    startSpinner("댓글 조회 중...");
    let existing;
    try {
      const detail = await client.getWikiPageComment(wikiId, pageId, parsed.commentId);
      existing = detail.result;
      stopSpinner(true, "댓글 조회 완료");
    } catch (e) {
      stopSpinner(false);
      throw e;
    }

    let newBody = await readBodyInputOrNull(opts);
    if (newBody == null) {
      newBody = await openInEditor(existing.body.content);
      if (!newBody.trim() || newBody === existing.body.content) {
        process.stdout.write("변경 사항이 없습니다.\n");
        return;
      }
    }

    startSpinner("댓글 수정 중...");
    try {
      await client.updateWikiPageComment(wikiId, pageId, parsed.commentId, {
        body: { content: newBody },
      });
      stopSpinner(true, "댓글 수정 완료");
      process.stdout.write(`댓글이 수정되었습니다: ${parsed.commentId}\n`);
    } catch (e) {
      stopSpinner(false);
      throw e;
    }
  });
