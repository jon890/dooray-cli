import { Command } from "commander";
import { getConfigOrThrow } from "../../config/store.js";
import { DoorayApiClient } from "../../api/client.js";
import { resolveProject } from "../../resolvers/project.js";
import { resolvePost } from "../../resolvers/post.js";
import { resolveMember, ensureMembers } from "../../resolvers/member.js";
import {
  openInEditor,
  serializePostFrontmatter,
  parsePostFrontmatter,
} from "../../editor/index.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { readBodyInputOrNull } from "../../utils/body-input.js";
import type { CreatePostUser } from "../../api/types.js";

async function resolveUsers(
  client: DoorayApiClient,
  projectId: string,
  emails: string[],
): Promise<CreatePostUser[]> {
  const users: CreatePostUser[] = [];
  for (const email of emails) {
    const memberId = await resolveMember(client, projectId, email);
    users.push({ type: "member", member: { organizationMemberId: memberId } });
  }
  return users;
}

export const postEditCommand = new Command("edit")
  .description("업무 수정 ($EDITOR 또는 --title/--body 옵션)")
  .argument("<project>", "프로젝트 코드 또는 ID")
  .argument("<post-number>", "업무 번호")
  .option("--title <title>", "제목 변경 (non-interactive)")
  .option("--subject <subject>", "--title의 deprecated alias")
  .option("--body <text>", "본문 변경 (- 입력 시 stdin, non-interactive)")
  .option("--body-file <path>", "본문 파일 경로 (- 입력 시 stdin, non-interactive)")
  .action(async (project, postNumberStr, opts) => {
    const config = await getConfigOrThrow();
    const client = new DoorayApiClient(config.apiKey, config.baseUrl);

    startSpinner("업무 조회 중...");
    const projectId = await resolveProject(client, project);
    const postId = await resolvePost(client, projectId, Number(postNumberStr));
    const res = await client.getPost(projectId, postId);
    const post = res.result;
    const members = await ensureMembers(client, projectId);
    stopSpinner(true, "업무 조회 완료");

    const title = opts.title ?? opts.subject;
    if (opts.subject && !opts.title) {
      process.stderr.write(
        "⚠  --subject는 deprecated입니다. 대신 --title을 사용해주세요.\n",
      );
    }

    const nonInteractive = title || opts.body || opts.bodyFile;

    if (nonInteractive) {
      // Non-interactive mode: apply only specified changes
      const newBody = await readBodyInputOrNull(opts);

      startSpinner("업무 수정 중...");
      const toUsers: CreatePostUser[] = post.users.to.map((u) => ({
        type: u.type,
        member: u.member,
        emailUser: u.emailUser,
        group: u.group,
      }));
      const ccUsers: CreatePostUser[] = post.users.cc.map((u) => ({
        type: u.type,
        member: u.member,
        emailUser: u.emailUser,
        group: u.group,
      }));

      await client.updatePost(projectId, postId, {
        subject: title ?? post.subject,
        body: {
          mimeType: "text/x-markdown",
          content: newBody ?? post.body.content,
        },
        priority: post.priority,
        dueDate: post.dueDate,
        dueDateFlag: post.dueDateFlag,
        users: { to: toUsers, cc: ccUsers },
      });
      stopSpinner(true, "업무 수정 완료");
    } else {
      // Interactive mode: $EDITOR
      const original = serializePostFrontmatter(post, members);
      const edited = await openInEditor(original);

      if (original === edited) {
        process.stdout.write("변경사항 없음\n");
        return;
      }

      const parsed = parsePostFrontmatter(edited);

      startSpinner("업무 수정 중...");
      const toUsers = await resolveUsers(client, projectId, parsed.to);
      const ccUsers = await resolveUsers(client, projectId, parsed.cc);

      await client.updatePost(projectId, postId, {
        subject: parsed.subject,
        body: { mimeType: "text/x-markdown", content: parsed.body },
        priority: parsed.priority,
        dueDate: parsed.due_date ?? undefined,
        dueDateFlag: parsed.due_date != null,
        users: { to: toUsers, cc: ccUsers },
      });
      stopSpinner(true, "업무 수정 완료");
    }

    process.stdout.write(`#${postNumberStr} 업무가 수정되었습니다.\n`);
  });
