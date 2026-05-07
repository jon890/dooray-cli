import { Command } from "commander";
import { getConfigOrThrow } from "../../config/store.js";
import { DoorayApiClient } from "../../api/client.js";
import { resolveProject } from "../../resolvers/project.js";
import { resolveMember } from "../../resolvers/member.js";
import { resolveTags, validateMandatoryTags } from "../../resolvers/tag.js";
import { resolveMilestone } from "../../resolvers/milestone.js";
import { resolvePostRef } from "../../resolvers/postRef.js";
import { resolveWorkflow } from "../../resolvers/workflow.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { DoorayCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
import { readBodyInput } from "../../utils/body-input.js";
import type { CreatePostUser } from "../../api/types.js";
import type { OutputOptions } from "../../formatters/table.js";
import { printJson } from "../../formatters/table.js";

async function resolveUsers(
  client: DoorayApiClient,
  projectId: string,
  inputs: string[],
): Promise<CreatePostUser[]> {
  const users: CreatePostUser[] = [];
  for (const input of inputs) {
    const memberId = await resolveMember(client, projectId, input);
    users.push({ type: "member", member: { organizationMemberId: memberId } });
  }
  return users;
}

export const postCreateCommand = new Command("create")
  .description("업무 생성")
  .argument("<project>", "프로젝트 코드 또는 ID")
  .option("--title <title>", "업무 제목")
  .option("--subject <subject>", "--title의 deprecated alias")
  .option("--to <members...>", "담당자 (이름 또는 이메일, 여러 명 가능)")
  .option("--cc <members...>", "참조자 (이름 또는 이메일, 여러 명 가능)")
  .option("--body <text>", "본문 텍스트 (- 입력 시 stdin에서 읽기)")
  .option("--body-file <path>", "본문 파일 경로 (- 입력 시 stdin에서 읽기)")
  .option("--priority <level>", "우선순위 (highest, high, normal, low, lowest)", "normal")
  .option("--due-date <date>", "마감일 (ISO 8601 형식)")
  .option("--tag <name>", "태그 이름 (반복 가능)", (value, prev: string[]) => [...prev, value], [] as string[])
  .option("--parent <ref>", "부모 업무 (project/number 또는 postId)")
  .option("--workflow <name>", "초기 워크플로우 이름 또는 class")
  .option("--milestone <name>", "마일스톤 이름")
  .action(async (project, opts) => {
    const globalOpts = postCreateCommand.optsWithGlobals() as OutputOptions;
    const config = await getConfigOrThrow();
    const client = new DoorayApiClient(config.apiKey, config.baseUrl);

    const subject = opts.title ?? opts.subject;
    if (!subject) {
      throw new DoorayCliError(
        "--title이 필요합니다.",
        EXIT_PARAM_ERROR,
      );
    }
    if (opts.subject && !opts.title) {
      process.stderr.write(
        "⚠  --subject는 deprecated입니다. 대신 --title을 사용해주세요.\n",
      );
    }

    const bodyContent = await readBodyInput(opts);

    startSpinner("업무 생성 중...");
    const projectId = await resolveProject(client, project);

    const toUsers = opts.to ? await resolveUsers(client, projectId, opts.to) : [];
    const ccUsers = opts.cc ? await resolveUsers(client, projectId, opts.cc) : [];

    const tagInputs = (opts.tag ?? []).filter((s: string) => s.length > 0);

    const [tagIds, parentPostId, milestoneId] = await Promise.all([
      tagInputs.length > 0
        ? resolveTags(client, projectId, tagInputs)
        : validateMandatoryTags(client, projectId).then(() => undefined),
      opts.parent
        ? resolvePostRef(client, opts.parent)
        : Promise.resolve<string | undefined>(undefined),
      opts.milestone
        ? resolveMilestone(client, projectId, opts.milestone)
        : Promise.resolve<string | undefined>(undefined),
    ]);

    const res = await client.createPost(projectId, {
      subject: subject,
      body: { mimeType: "text/x-markdown", content: bodyContent },
      users: { to: toUsers, cc: ccUsers },
      priority: opts.priority,
      ...(opts.dueDate && { dueDate: opts.dueDate, dueDateFlag: true }),
      ...(parentPostId && { parentPostId }),
      ...(milestoneId && { milestoneId }),
      ...(tagIds && tagIds.length > 0 && { tagIds }),
    });
    stopSpinner(true, "업무 생성 완료");

    if (opts.workflow) {
      try {
        const workflowId = await resolveWorkflow(client, projectId, opts.workflow);
        await client.setPostWorkflow(projectId, res.result.id, workflowId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`⚠  워크플로우 설정 실패 (post는 생성됨): ${msg}\n`);
        // exit 0 유지 — 업무는 이미 생성됨
      }
    }

    if (globalOpts.json) {
      printJson(res.result);
    } else if (globalOpts.quiet) {
      process.stdout.write(res.result.id + "\n");
    } else {
      process.stdout.write(`업무가 생성되었습니다: ${res.result.id}\n`);
    }
  });
