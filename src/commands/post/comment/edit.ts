import { Command } from "commander";
import { getConfigOrThrow } from "../../../config/store.js";
import { DoorayApiClient } from "../../../api/client.js";
import { resolvePostInput } from "../../../resolvers/post-input.js";
import { openInEditor } from "../../../editor/index.js";
import { startSpinner, stopSpinner } from "../../../utils/spinner.js";
import { readBodyInputOrNull } from "../../../utils/body-input.js";
import { DoorayCliError } from "../../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../../utils/exit-codes.js";
import { resolveMember, buildMemberNameMap } from "../../../resolvers/member.js";
import { resolveMemberGroup } from "../../../resolvers/member-group.js";
import { ensureMe } from "../../../resolvers/me.js";
import { prependMentions } from "../../../utils/mention.js";

export const commentEditCommand = new Command("edit")
  .description("댓글 수정 ($EDITOR 또는 --body 옵션)")
  .argument("[arg1]", "프로젝트 코드 / Dooray URL / 댓글 ID (모드별)")
  .argument("[arg2]", "업무 번호 또는 댓글 ID (모드별)")
  .argument("[arg3]", "댓글 ID (positional 3개 모드)")
  .option("--id <postId>", "Dooray post ID (project/post-number 대신)")
  .option("--url <url>", "Dooray 업무 URL (project/post-number 대신)")
  .option("--comment-id <commentId>", "댓글 ID (positional 대체)")
  .option("--body <text>", "댓글 본문 변경 (- 입력 시 stdin, non-interactive)")
  .option("--body-file <path>", "본문 파일 경로 (- 입력 시 stdin, non-interactive)")
  .option(
    "--mention <name>",
    "멤버 멘션 (반복 가능, 이름 부분일치)",
    (value: string, prev: string[]) => [...prev, value],
    [] as string[],
  )
  .option(
    "--mention-group <code>",
    "그룹 멘션 (반복 가능, code 부분일치)",
    (value: string, prev: string[]) => [...prev, value],
    [] as string[],
  )
  .action(async (arg1, arg2, arg3, opts) => {
    const config = await getConfigOrThrow();
    const client = new DoorayApiClient(config.apiKey, config.baseUrl);

    let projectArg: string | undefined;
    let postNumberArg: string | undefined;
    let commentId: string | undefined = opts.commentId;

    if (opts.id || opts.url) {
      // 옵션 모드: arg1 = comment-id (있다면), arg2/arg3은 비어야 함
      if (arg2 || arg3) {
        throw new DoorayCliError(
          "--id/--url 모드에서는 댓글 ID 외 추가 positional 인자를 받지 않습니다. --comment-id 옵션 사용을 권장합니다.",
          EXIT_PARAM_ERROR,
        );
      }
      commentId = commentId ?? arg1;
    } else if (arg3) {
      // positional 3개 모드 (legacy): project + post-number + comment-id
      projectArg = arg1;
      postNumberArg = arg2;
      commentId = commentId ?? arg3;
    } else if (arg1 && !arg2) {
      // positional 1개 — URL positional 모드
      projectArg = arg1;
      if (!commentId) {
        throw new DoorayCliError(
          "URL/--id 모드에서는 --comment-id 옵션이 필요합니다.",
          EXIT_PARAM_ERROR,
        );
      }
    } else {
      // positional 2개 — project + post-number, comment-id는 옵션 필수
      projectArg = arg1;
      postNumberArg = arg2;
      if (!commentId) {
        throw new DoorayCliError(
          "<comment-id>가 필요합니다. positional 3번째 또는 --comment-id 옵션을 사용하세요.",
          EXIT_PARAM_ERROR,
        );
      }
    }

    if (!commentId) {
      throw new DoorayCliError(
        "<comment-id>가 필요합니다.",
        EXIT_PARAM_ERROR,
      );
    }

    startSpinner("댓글 조회 중...");
    const { projectId, postId, projectCode } = await resolvePostInput(client, {
      projectArg,
      postNumberArg,
      idOpt: opts.id,
      urlOpt: opts.url,
    });
    const comments = await client.getPostComments(projectId, postId);
    const comment = comments.result.find((c) => c.id === commentId);
    stopSpinner(true, "댓글 조회 완료");

    if (!comment) {
      process.stderr.write(`댓글을 찾을 수 없습니다: ${commentId}\n`);
      process.exit(1);
    }

    // 멘션 옵션 처리
    const mentionInputs: string[] = (opts.mention ?? []).filter((s: string) => s.length > 0);
    const groupInputs: string[] = (opts.mentionGroup ?? []).filter((s: string) => s.length > 0);

    let mentionPrefix = "";
    if (mentionInputs.length > 0 || groupInputs.length > 0) {
      const me = await ensureMe(client);
      const memberIds = await Promise.all(
        mentionInputs.map((name) => resolveMember(client, projectId, name)),
      );
      const nameMap = await buildMemberNameMap(client, projectId);
      const members = memberIds.map((memberId) => ({
        memberId,
        name: nameMap.get(memberId) ?? memberId,
      }));

      const groups = await Promise.all(
        groupInputs.map(async (code) => {
          const g = await resolveMemberGroup(client, projectId, code);
          return { groupId: g.id, code: g.code, projectCode };
        }),
      );
      mentionPrefix = prependMentions("", members, groups, me).trimEnd();
    }

    let edited = await readBodyInputOrNull(opts);

    if (edited == null) {
      // Interactive mode: $EDITOR
      const rawContent = comment.body.content;
      const editorSeed = mentionPrefix ? mentionPrefix + " " + rawContent : rawContent;
      edited = await openInEditor(editorSeed);

      if (rawContent === edited) {
        process.stdout.write("변경사항 없음\n");
        return;
      }
    } else if (mentionPrefix) {
      edited = mentionPrefix + " " + edited;
    }

    startSpinner("댓글 수정 중...");
    await client.updatePostComment(projectId, postId, commentId, {
      body: { mimeType: "text/x-markdown", content: edited },
    });
    stopSpinner(true, "댓글 수정 완료");

    process.stdout.write(`댓글이 수정되었습니다: ${commentId}\n`);
  });
