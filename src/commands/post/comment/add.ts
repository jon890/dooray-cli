import { Command } from "commander";
import { getConfigOrThrow } from "../../../config/store.js";
import { DoorayApiClient } from "../../../api/client.js";
import { resolvePostInput } from "../../../resolvers/post-input.js";
import { openInEditor } from "../../../editor/index.js";
import { startSpinner, stopSpinner } from "../../../utils/spinner.js";
import { readBodyInputOrNull } from "../../../utils/body-input.js";
import type { OutputOptions } from "../../../formatters/table.js";
import { printJson } from "../../../formatters/table.js";
import { resolveMember, buildMemberNameMap } from "../../../resolvers/member.js";
import { resolveMemberGroup } from "../../../resolvers/member-group.js";
import { ensureMe } from "../../../resolvers/me.js";
import { prependMentions } from "../../../utils/mention.js";
import { appendTaskLinks, type TaskLinkInput } from "../../../utils/task-link.js";
import { DoorayCliError } from "../../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../../utils/exit-codes.js";

export const commentAddCommand = new Command("add")
  .description("댓글 추가")
  .argument("[project]", "프로젝트 코드 (또는 첫 인자에 Dooray URL)")
  .argument("[post-number]", "업무 번호 (project와 함께 사용)")
  .option("--id <postId>", "Dooray post ID (project/post-number 대신)")
  .option("--url <url>", "Dooray 업무 URL (project/post-number 대신)")
  .option("--body <text>", "댓글 본문 (- 입력 시 stdin에서 읽기)")
  .option("--body-file <path>", "본문 파일 경로 (- 입력 시 stdin에서 읽기)")
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
  .option("--dry-run", "API 호출 없이 합성된 본문만 stdout 출력 (mention/link-task 적용 결과 미리보기)")
  .action(async (project, postNumberStr, opts) => {
    const globalOpts = commentAddCommand.optsWithGlobals() as OutputOptions;
    const config = await getConfigOrThrow();
    const client = new DoorayApiClient(config.apiKey, config.baseUrl);

    let bodyContent = await readBodyInputOrNull(opts);

    if (bodyContent == null) {
      bodyContent = await openInEditor("");
      if (!bodyContent.trim()) {
        process.stdout.write("빈 댓글은 작성할 수 없습니다.\n");
        return;
      }
    }

    startSpinner("댓글 추가 중...");
    const { projectId, postId, projectCode } = await resolvePostInput(client, {
      projectArg: project,
      postNumberArg: postNumberStr,
      idOpt: opts.id,
      urlOpt: opts.url,
    });

    const mentionInputs: string[] = (opts.mention ?? []).filter((s: string) => s.length > 0);
    const groupInputs: string[] = (opts.mentionGroup ?? []).filter((s: string) => s.length > 0);
    const linkInputs: string[] = (opts.linkTask ?? []).filter((s: string) => s.length > 0);

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
      bodyContent = prependMentions(bodyContent, members, groups, me);
    }

    if (linkInputs.length > 0) {
      const me = await ensureMe(client);
      const links: TaskLinkInput[] = await Promise.all(
        linkInputs.map(async (ref) => {
          let projectArg: string | undefined;
          let postNumberArg: string | undefined;
          let idOpt: string | undefined;
          if (/^[0-9]{15,}$/.test(ref)) {
            idOpt = ref;
          } else if (ref.includes("/")) {
            const [p, n] = ref.split("/");
            if (!p || !n) {
              throw new DoorayCliError(
                `--link-task 형식이 올바르지 않습니다: "${ref}". <project>/<number> 또는 postId를 입력하세요.`,
                EXIT_PARAM_ERROR,
              );
            }
            projectArg = p;
            postNumberArg = n;
          } else {
            throw new DoorayCliError(
              `--link-task 형식이 올바르지 않습니다: "${ref}". <project>/<number> 또는 postId를 입력하세요.`,
              EXIT_PARAM_ERROR,
            );
          }
          const { projectId: pid, postId: pidPost, projectCode: pCode, postNumber } =
            await resolvePostInput(client, { projectArg, postNumberArg, idOpt });
          const detail = await client.getPost(pid, pidPost);
          return {
            projectCode: pCode,
            number: postNumber,
            postId: pidPost,
            subject: detail.result.subject,
            workflowClass: detail.result.workflowClass,
          };
        }),
      );
      bodyContent = appendTaskLinks(bodyContent, links, me);
    }

    if (opts.dryRun) {
      stopSpinner(false);
      if (globalOpts.json) {
        process.stdout.write(JSON.stringify({ body: bodyContent }) + "\n");
      } else {
        process.stdout.write(bodyContent + "\n");
      }
      return;
    }

    const res = await client.createPostComment(projectId, postId, {
      body: { mimeType: "text/x-markdown", content: bodyContent },
    });
    stopSpinner(true, "댓글 추가 완료");

    if (globalOpts.json) {
      printJson(res.result);
    } else if (globalOpts.quiet) {
      process.stdout.write(res.result.id + "\n");
    } else {
      process.stdout.write(`댓글이 추가되었습니다: ${res.result.id}\n`);
    }
  });
