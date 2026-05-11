import { Command } from "commander";
import { getConfigOrThrow } from "../../config/store.js";
import { DoorayApiClient } from "../../api/client.js";
import { resolveProject, ensureProjects } from "../../resolvers/project.js";
import { resolvePostInput } from "../../resolvers/post-input.js";
import { resolveMember, buildMemberNameMap } from "../../resolvers/member.js";
import { resolveMemberGroup } from "../../resolvers/member-group.js";
import { resolveTags, validateMandatoryTags } from "../../resolvers/tag.js";
import { resolveMilestone } from "../../resolvers/milestone.js";
import { resolvePostRef } from "../../resolvers/postRef.js";
import { resolveWorkflow } from "../../resolvers/workflow.js";
import { ensureMe } from "../../resolvers/me.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { DoorayCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
import { readBodyInput } from "../../utils/body-input.js";
import { prependMentions } from "../../utils/mention.js";
import { appendTaskLinks } from "../../utils/task-link.js";
import { resolveTaskLinks } from "../../resolvers/task-link.js";
import { resolveUserAdditions } from "../../resolvers/post-users.js";
import { resolveTemplate } from "../../resolvers/template.js";
import type { CreatePostUser, TemplateDetail } from "../../api/types.js";
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
  .option("--to-group <code>", "담당자(to) 그룹 추가 (반복 가능, 그룹 코드 부분일치)", (v, prev: string[]) => [...prev, v], [] as string[])
  .option("--cc <members...>", "참조자 (이름 또는 이메일, 여러 명 가능)")
  .option("--cc-group <code>", "참조자(cc) 그룹 추가 (반복 가능, 그룹 코드 부분일치)", (v, prev: string[]) => [...prev, v], [] as string[])
  .option("--body <text>", "본문 텍스트 (- 입력 시 stdin에서 읽기)")
  .option("--body-file <path>", "본문 파일 경로 (- 입력 시 stdin에서 읽기)")
  .option("--priority <level>", "우선순위 (highest, high, normal, low, lowest)", "normal")
  .option("--due-date <date>", "마감일 (ISO 8601 형식)")
  .option("--tag <name>", "태그 이름 (반복 가능)", (value, prev: string[]) => [...prev, value], [] as string[])
  .option("--mention <name>", "멤버 멘션 (반복 가능, 이름 부분일치)", (v, prev: string[]) => [...prev, v], [] as string[])
  .option("--mention-group <code>", "그룹 멘션 (반복 가능, code 부분일치)", (v, prev: string[]) => [...prev, v], [] as string[])
  .option("--link-task <ref>", "다른 업무 링크 추가 (<project>/<number> 또는 postId, 반복 가능)", (v, prev: string[]) => [...prev, v], [] as string[])
  .option("--parent <ref>", "부모 업무 (project/number 또는 postId)")
  .option("--template <ref>", "템플릿 이름 또는 ID — body/users/tags 자동 채움 (사용자 옵션 우선 override, ADR-027)")
  .option("--workflow <name>", "초기 워크플로우 이름 또는 class")
  .option("--milestone <name>", "마일스톤 이름")
  .option("--dry-run", "API 호출 없이 합성된 본문만 stdout 출력 (mention/link-task 적용 결과 미리보기)")
  .action(async (project, opts) => {
    const globalOpts = postCreateCommand.optsWithGlobals() as OutputOptions;
    const config = await getConfigOrThrow();
    const client = new DoorayApiClient(config.apiKey, config.baseUrl);

    if (opts.subject && !opts.title) {
      process.stderr.write(
        "⚠  --subject는 deprecated입니다. 대신 --title을 사용해주세요.\n",
      );
    }

    const mentionInputs: string[] = (opts.mention ?? []).filter((s: string) => s.length > 0);
    const groupInputs: string[] = (opts.mentionGroup ?? []).filter((s: string) => s.length > 0);
    const linkInputs: string[] = (opts.linkTask ?? []).filter((s: string) => s.length > 0);

    startSpinner("업무 생성 중...");
    const projectId = await resolveProject(client, project);

    // 템플릿 조회 + 사용자 옵션 override (ADR-027)
    let templateDetail: TemplateDetail | null = null;
    if (opts.template) {
      try {
        const templateId = await resolveTemplate(client, projectId, opts.template);
        const res = await client.getProjectTemplateDetail(projectId, templateId, true);
        templateDetail = res.result;
      } catch (e) {
        stopSpinner(false);
        throw e;
      }
    }

    // subject: 사용자 --title/--subject 우선, 없으면 템플릿
    const subject = opts.title ?? opts.subject ?? templateDetail?.subject;
    if (!subject) {
      stopSpinner(false);
      const msg = opts.template
        ? `--template "${opts.template}" 에 제목이 없습니다. --title 로 지정하세요.`
        : "--title 또는 --template 둘 중 하나 필요합니다.";
      throw new DoorayCliError(msg, EXIT_PARAM_ERROR);
    }

    // body: 사용자 --body/--body-file 우선, 없으면 템플릿
    let bodyContent: string;
    try {
      bodyContent = await readBodyInput(opts);
    } catch (e) {
      // readBodyInput 은 --body / --body-file 충돌, 파일 부재, TTY stdin 등에서 throw
      // — spinner leak 방지 위해 catch 후 stop + re-throw (code-review-pitfalls 1-2)
      stopSpinner(false);
      throw e;
    }
    if (!bodyContent && templateDetail?.body) {
      bodyContent = templateDetail.body.content;
    }

    let projectCode: string | undefined;
    if (groupInputs.length > 0) {
      const projects = await ensureProjects(client);
      projectCode = projects.find((p) => p.id === projectId)?.code;
      if (!projectCode) {
        throw new DoorayCliError(
          `--mention-group 은 공개 프로젝트에서만 지원됩니다. dooray project list 로 캐시 갱신 후 재시도하세요.`,
          EXIT_PARAM_ERROR,
        );
      }
    }

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
          return { groupId: g.id, code: g.code, projectCode: projectCode ?? "" };
        }),
      );
      bodyContent = prependMentions(bodyContent, members, groups, me);
    }

    if (linkInputs.length > 0) {
      const me = await ensureMe(client);
      const links = await resolveTaskLinks(client, linkInputs);
      bodyContent = appendTaskLinks(bodyContent, links, me);
    }

    if (opts.dryRun) {
      stopSpinner(false);
      if (globalOpts.json) {
        process.stdout.write(
          JSON.stringify({
            body: bodyContent,
            ...(opts.template && { templateUsed: opts.template }),
          }) + "\n",
        );
      } else {
        process.stdout.write(bodyContent + "\n");
      }
      return;
    }

    const ccGroupCodes: string[] = (opts.ccGroup ?? []).filter((s: string) => s.length > 0);
    const toGroupCodes: string[] = (opts.toGroup ?? []).filter((s: string) => s.length > 0);

    // to/cc: 사용자 옵션 우선. 미지정 시 템플릿 users 폴백 (CreatePostUser 형식으로 type-cast)
    const toUsersMembers = opts.to
      ? await resolveUsers(client, projectId, opts.to)
      : (templateDetail?.users?.to ?? []).map((u) => u as unknown as CreatePostUser);
    const ccUsersMembers = opts.cc
      ? await resolveUsers(client, projectId, opts.cc)
      : (templateDetail?.users?.cc ?? []).map((u) => u as unknown as CreatePostUser);
    const toUsersGroups = toGroupCodes.length > 0
      ? await resolveUserAdditions(client, projectId, [], toGroupCodes)
      : [];
    const ccUsersGroups = ccGroupCodes.length > 0
      ? await resolveUserAdditions(client, projectId, [], ccGroupCodes)
      : [];

    const toUsers = [...toUsersMembers, ...toUsersGroups];
    const ccUsers = [...ccUsersMembers, ...ccUsersGroups];

    // tags: 사용자 --tag 우선. 미지정 시 템플릿 tags 폴백
    const tagInputs = (opts.tag ?? []).filter((s: string) => s.length > 0);
    const templateTagNames = (templateDetail?.tags ?? [])
      .map((t) => t.name)
      .filter((n): n is string => !!n);
    const effectiveTagInputs = tagInputs.length > 0 ? tagInputs : templateTagNames;

    const [tagIds, parentPostId, milestoneId] = await Promise.all([
      effectiveTagInputs.length > 0
        ? resolveTags(client, projectId, effectiveTagInputs)
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
