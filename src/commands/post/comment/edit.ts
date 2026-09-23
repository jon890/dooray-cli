import { Command, Option } from "commander";
import { getConfigOrThrow } from "../../../config/store.js";
import { DoorayApiClient } from "../../../api/client.js";
import { resolvePostInput } from "../../../resolvers/post-input.js";
import { openInEditor } from "../../../editor/index.js";
import { startSpinner, stopSpinner } from "../../../utils/spinner.js";
import { readBodyInputOrNull, BODY_MIME_TYPES, resolveBodyMimeType, warnUnconvertedBody } from "../../../utils/body-input.js";
import { DoorayCliError } from "../../../utils/errors.js";
import { EXIT_API_ERROR, EXIT_PARAM_ERROR } from "../../../utils/exit-codes.js";
import type { PostComment } from "../../../api/types.js";
import type { OutputOptions } from "../../../formatters/table.js";
import { resolveMember, buildMemberNameMap } from "../../../resolvers/member.js";
import { resolveMemberGroup } from "../../../resolvers/member-group.js";
import { ensureMe } from "../../../resolvers/me.js";
import { prependMentions } from "../../../utils/mention.js";
import { appendTaskLinks } from "../../../utils/task-link.js";
import { resolveTaskLinks } from "../../../resolvers/task-link.js";
import { checkAndGuardDropped } from "../../../utils/attachment-check.js";
import { checkMarkupSupport, type BodyMarkupKind } from "../../../utils/body-markup.js";

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
  .option("--no-confirm", "누락 attachment 경고 시 confirm 없이 진행 (자동화용)")
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
  .option("--link-task <ref>", "다른 업무 링크 추가 (<project>/<number> 또는 postId, 반복 가능)", (v, prev: string[]) => [...prev, v], [] as string[])
  .addOption(
    new Option("--mime-type <type>", "본문 형식 (미지정 시 기존 댓글의 형식 유지)")
      .choices(BODY_MIME_TYPES),
  )
  .option("--dry-run", "API 호출 없이 합성된 본문만 stdout 출력 (mention/link-task 적용 결과 미리보기)")
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
    let resolved: Awaited<ReturnType<typeof resolvePostInput>>;
    let comment: PostComment | undefined;
    try {
      resolved = await resolvePostInput(client, {
        projectArg,
        postNumberArg,
        idOpt: opts.id,
        urlOpt: opts.url,
        argv: process.argv.slice(2),
      });
      // 목록 조회는 첫 페이지만 돌려주므로 단건 조회로 가져온다. 없는 댓글이면 client 가 API 오류로 바꿔 던진다.
      comment = (await client.getPostComment(resolved.projectId, resolved.postId, commentId)).result;
    } catch (e) {
      stopSpinner(false);
      throw e;
    }
    if (!comment) {
      stopSpinner(false);
      throw new DoorayCliError(`댓글을 찾을 수 없습니다: ${commentId}`, EXIT_API_ERROR);
    }
    stopSpinner(true, "댓글 조회 완료");
    const { projectId, postId, projectCode } = resolved;

    // 멘션 옵션 처리
    const mentionInputs: string[] = (opts.mention ?? []).filter((s: string) => s.length > 0);
    const groupInputs: string[] = (opts.mentionGroup ?? []).filter((s: string) => s.length > 0);
    const linkInputs: string[] = (opts.linkTask ?? []).filter((s: string) => s.length > 0);

    // 본문 형식은 한 번만 구해 두고 아래 세 곳이 같은 값을 쓴다.
    // 반복해서 부르면 한 곳을 고칠 때 다른 곳이 어긋난다.
    const bodyMimeType = resolveBodyMimeType(comment.body.mimeType, opts.mimeType);

    // 본문 형식이 그 마크업을 받지 못하면 멤버·업무를 해석하기 전에 멈춘다 (ADR-055).
    const requireMarkup = (kind: BodyMarkupKind): void => {
      const check = checkMarkupSupport(bodyMimeType, kind);
      if (!check.supported) throw new DoorayCliError(check.message, EXIT_PARAM_ERROR);
    };
    if (mentionInputs.length > 0) requireMarkup("member-mention");
    if (groupInputs.length > 0) requireMarkup("group-mention");
    if (linkInputs.length > 0) requireMarkup("task-link");

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
      mentionPrefix = prependMentions("", members, groups, me, bodyMimeType).trimEnd();
    }

    let edited = await readBodyInputOrNull(opts);
    warnUnconvertedBody(comment.body.mimeType, opts.mimeType, edited != null);

    if (edited == null && opts.mimeType != null) {
      // --mime-type 단독 지정: 본문은 그대로 두고 형식만 바꾼다.
      // $EDITOR 를 열면 비대화형 환경에서 쓸 수 없고, 열려도 본문이 그대로면
      // "변경사항 없음" 으로 끝나 형식을 되돌릴 수단이 없다.
      edited = comment.body.content;
    }

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

    if (linkInputs.length > 0) {
      const me = await ensureMe(client);
      const links = await resolveTaskLinks(client, linkInputs);
      edited = appendTaskLinks(edited, links, me, bodyMimeType);
    }

    if (opts.dryRun) {
      stopSpinner(false);
      const globalOpts = commentEditCommand.optsWithGlobals() as OutputOptions;
      if (globalOpts.json) {
        process.stdout.write(JSON.stringify({
          body: edited,
          mimeType: bodyMimeType,
        }) + "\n");
      } else {
        process.stdout.write(edited + "\n");
      }
      return;
    }

    const attachments = (comment.files ?? []).map((f) => ({ id: f.id, name: f.name }));
    await checkAndGuardDropped(comment.body.content, edited, attachments, !opts.confirm);

    startSpinner("댓글 수정 중...");
    await client.updatePostComment(projectId, postId, commentId, {
      body: { mimeType: bodyMimeType, content: edited },
    });
    stopSpinner(true, "댓글 수정 완료");

    process.stdout.write(`댓글이 수정되었습니다: ${commentId}\n`);
  });
