import { Command } from "commander";
import { getConfigOrThrow } from "../../../config/store.js";
import { DoorayApiClient } from "../../../api/client.js";
import { resolveProject } from "../../../resolvers/project.js";
import { resolvePost } from "../../../resolvers/post.js";
import { openInEditor } from "../../../editor/index.js";
import { startSpinner, stopSpinner } from "../../../utils/spinner.js";
import { readBodyInputOrNull } from "../../../utils/body-input.js";

export const commentEditCommand = new Command("edit")
  .description("댓글 수정 ($EDITOR 또는 --body 옵션)")
  .argument("<project>", "프로젝트 코드 또는 ID")
  .argument("<post-number>", "업무 번호")
  .argument("<comment-id>", "댓글 ID")
  .option("--body <text>", "댓글 본문 변경 (- 입력 시 stdin, non-interactive)")
  .option("--body-file <path>", "본문 파일 경로 (- 입력 시 stdin, non-interactive)")
  .action(async (project, postNumberStr, commentId, opts) => {
    const config = await getConfigOrThrow();
    const client = new DoorayApiClient(config.apiKey, config.baseUrl);

    startSpinner("댓글 조회 중...");
    const projectId = await resolveProject(client, project);
    const postId = await resolvePost(client, projectId, Number(postNumberStr));
    const comments = await client.getPostComments(projectId, postId);
    const comment = comments.result.find((c) => c.id === commentId);
    stopSpinner(true, "댓글 조회 완료");

    if (!comment) {
      process.stderr.write(`댓글을 찾을 수 없습니다: ${commentId}\n`);
      process.exit(1);
    }

    let edited = await readBodyInputOrNull(opts);

    if (edited == null) {
      // Interactive mode: $EDITOR
      const original = comment.body.content;
      edited = await openInEditor(original);

      if (original === edited) {
        process.stdout.write("변경사항 없음\n");
        return;
      }
    }

    startSpinner("댓글 수정 중...");
    await client.updatePostComment(projectId, postId, commentId, {
      body: { mimeType: "text/x-markdown", content: edited },
    });
    stopSpinner(true, "댓글 수정 완료");

    process.stdout.write(`댓글이 수정되었습니다: ${commentId}\n`);
  });
