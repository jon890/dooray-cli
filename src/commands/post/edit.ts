import { Command } from "commander";
import { getConfigOrThrow } from "../../config/store.js";
import { DoorayApiClient } from "../../api/client.js";
import { resolvePostInput } from "../../resolvers/post-input.js";
import { resolveMember, ensureMembers, buildMemberNameMap } from "../../resolvers/member.js";
import { resolveMemberGroup } from "../../resolvers/member-group.js";
import { ensureMe } from "../../resolvers/me.js";
import { prependMentions } from "../../utils/mention.js";
import { appendTaskLinks } from "../../utils/task-link.js";
import { resolveTaskLinks } from "../../resolvers/task-link.js";
import { resolveUserAdditions, mergeUsers } from "../../resolvers/post-users.js";
import { lookupTagIds, validateMandatoryCoverage } from "../../resolvers/tag.js";
import { mergeTagIds } from "../../resolvers/post-tags.js";
import { resolvePostRef } from "../../resolvers/postRef.js";
import type { OutputOptions } from "../../formatters/table.js";
import {
  openInEditor,
  serializePostFrontmatter,
  parsePostFrontmatter,
} from "../../editor/index.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { readBodyInputOrNull } from "../../utils/body-input.js";
import { checkAndGuardDropped } from "../../utils/attachment-check.js";
import type { CreatePostUser } from "../../api/types.js";

async function resolveUsers(
  client: DoorayApiClient,
  projectId: string,
  names: string[],
): Promise<CreatePostUser[]> {
  const users: CreatePostUser[] = [];
  for (const name of names) {
    const memberId = await resolveMember(client, projectId, name);
    users.push({ type: "member", member: { organizationMemberId: memberId } });
  }
  return users;
}

export const postEditCommand = new Command("edit")
  .description("업무 수정 ($EDITOR 또는 --title/--body 옵션)")
  .argument("[project]", "프로젝트 코드 (또는 첫 인자에 Dooray URL)")
  .argument("[post-number]", "업무 번호 (project와 함께 사용)")
  .option("--id <postId>", "Dooray post ID (project/post-number 대신)")
  .option("--url <url>", "Dooray 업무 URL (project/post-number 대신)")
  .option("--title <title>", "제목 변경 (non-interactive)")
  .option("--subject <subject>", "--title의 deprecated alias")
  .option("--body <text>", "본문 변경 (- 입력 시 stdin, non-interactive)")
  .option("--body-file <path>", "본문 파일 경로 (- 입력 시 stdin, non-interactive)")
  .option("--mention <name>", "멤버 멘션 (반복 가능, 이름 부분일치)", (v, prev: string[]) => [...prev, v], [] as string[])
  .option("--mention-group <code>", "그룹 멘션 (반복 가능, code 부분일치)", (v, prev: string[]) => [...prev, v], [] as string[])
  .option("--link-task <ref>", "다른 업무 링크 추가 (<project>/<number> 또는 postId, 반복 가능)", (v, prev: string[]) => [...prev, v], [] as string[])
  .option("--cc <name>", "참조자(cc) 멤버 추가 (반복 가능, 이름 부분일치)", (v, prev: string[]) => [...prev, v], [] as string[])
  .option("--cc-group <code>", "참조자(cc) 그룹 추가 (반복 가능, 그룹 코드 부분일치)", (v, prev: string[]) => [...prev, v], [] as string[])
  .option("--cc-clear", "기존 참조자 전부 제거 후 신규만 적용 (--cc/--cc-group 와 조합 가능)")
  .option("--to <name>", "담당자(to) 멤버 추가 (반복 가능, 이름 부분일치)", (v, prev: string[]) => [...prev, v], [] as string[])
  .option("--to-group <code>", "담당자(to) 그룹 추가 (반복 가능, 그룹 코드 부분일치)", (v, prev: string[]) => [...prev, v], [] as string[])
  .option("--to-clear", "기존 담당자 전부 제거 후 신규만 적용")
  .option("--parent <ref>", "상위 업무 변경 — project/number 또는 raw postId (post create 와 동일 — unset 은 미지원, 웹 UI 에서 처리)")
  .option("--tag <name>", "태그 추가 (반복 가능, 기존 태그 유지 + 신규 추가 + dedupe)", (v, prev: string[]) => [...prev, v], [] as string[])
  .option("--tag-clear", "기존 태그 전부 제거 후 --tag 만 적용")
  .option("--tag-remove <name>", "특정 태그 제거 (반복 가능, 이름 부분일치)", (v, prev: string[]) => [...prev, v], [] as string[])
  .option("--dry-run", "API 호출 없이 합성된 본문만 stdout 출력 (mention/link-task 적용 결과 미리보기)")
  .option("--no-confirm", "누락 attachment 경고 시 confirm 없이 진행 (자동화용)")
  .action(async (project, postNumberStr, opts) => {
    const config = await getConfigOrThrow();
    const client = new DoorayApiClient(config.apiKey, config.baseUrl);

    const mentionInputs: string[] = (opts.mention ?? []).filter((s: string) => s.length > 0);
    const groupInputs: string[] = (opts.mentionGroup ?? []).filter((s: string) => s.length > 0);
    const linkInputs: string[] = (opts.linkTask ?? []).filter((s: string) => s.length > 0);
    const ccNames: string[] = (opts.cc ?? []).filter((s: string) => s.length > 0);
    const ccGroups: string[] = (opts.ccGroup ?? []).filter((s: string) => s.length > 0);
    const toNames: string[] = (opts.to ?? []).filter((s: string) => s.length > 0);
    const toGroups: string[] = (opts.toGroup ?? []).filter((s: string) => s.length > 0);
    const tagAdditions: string[] = (opts.tag ?? []).filter((s: string) => s.length > 0);
    const tagRemovals: string[] = (opts.tagRemove ?? []).filter((s: string) => s.length > 0);
    const hasParticipantChange = ccNames.length > 0 || ccGroups.length > 0 || !!opts.ccClear ||
      toNames.length > 0 || toGroups.length > 0 || !!opts.toClear;
    const hasTagChange = tagAdditions.length > 0 || tagRemovals.length > 0 || !!opts.tagClear;

    startSpinner("업무 조회 중...");
    const { projectId, postId, postNumber, projectCode } = await resolvePostInput(client, {
      projectArg: project,
      postNumberArg: postNumberStr,
      idOpt: opts.id,
      urlOpt: opts.url,
    });
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

    const nonInteractive = title || opts.body || opts.bodyFile || hasTagChange || hasParticipantChange;

    if (nonInteractive) {
      // Non-interactive mode: apply only specified changes
      let newBody = await readBodyInputOrNull(opts);

      if (newBody != null && !opts.dryRun) {
        const attachments = (post.files ?? []).map((f) => ({ id: f.id, name: f.name }));
        await checkAndGuardDropped(post.body.content, newBody, attachments, !opts.confirm);
      }

      if (mentionInputs.length > 0 || groupInputs.length > 0) {
        const effectiveBody = newBody ?? post.body.content;
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
        newBody = prependMentions(effectiveBody, members, groups, me);
      }

      if (linkInputs.length > 0) {
        const effectiveBody = newBody ?? post.body.content;
        const me = await ensureMe(client);
        const links = await resolveTaskLinks(client, linkInputs);
        newBody = appendTaskLinks(effectiveBody, links, me);
      }

      let toUsers: CreatePostUser[] = post.users.to.map((u) => ({
        type: u.type,
        member: u.member,
        emailUser: u.emailUser,
        group: u.group,
      }));
      let ccUsers: CreatePostUser[] = post.users.cc.map((u) => ({
        type: u.type,
        member: u.member,
        emailUser: u.emailUser,
        group: u.group,
      }));

      if (toNames.length > 0 || toGroups.length > 0 || opts.toClear) {
        const additions = await resolveUserAdditions(client, projectId, toNames, toGroups);
        toUsers = mergeUsers(toUsers, additions, !!opts.toClear);
      }
      if (ccNames.length > 0 || ccGroups.length > 0 || opts.ccClear) {
        const additions = await resolveUserAdditions(client, projectId, ccNames, ccGroups);
        ccUsers = mergeUsers(ccUsers, additions, !!opts.ccClear);
      }

      let finalTagIds: string[] | undefined;
      if (hasTagChange) {
        const existingTagIds = post.tags.map((t) => t.id);
        const additionIds = await lookupTagIds(client, projectId, tagAdditions);
        const removalIds = await lookupTagIds(client, projectId, tagRemovals);
        finalTagIds = mergeTagIds(existingTagIds, additionIds, removalIds, !!opts.tagClear);
        await validateMandatoryCoverage(client, projectId, finalTagIds);
      }

      if (opts.dryRun) {
        stopSpinner(false);
        const globalOpts = postEditCommand.optsWithGlobals() as OutputOptions;
        const previewBody = newBody ?? post.body.content;
        if (globalOpts.json) {
          process.stdout.write(JSON.stringify({
            body: previewBody,
            users: { to: toUsers, cc: ccUsers },
            ...(finalTagIds !== undefined && { tagIds: finalTagIds }),
            ...(opts.parent && { parentChange: opts.parent }),
          }) + "\n");
        } else {
          process.stdout.write(previewBody + "\n");
        }
        return;
      }

      startSpinner("업무 수정 중...");
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
        ...(finalTagIds !== undefined && { tagIds: finalTagIds }),
      });
      stopSpinner(true, "업무 수정 완료");

      if (opts.parent) {
        startSpinner("상위 업무 변경 중...");
        try {
          const newParentPostId = await resolvePostRef(client, opts.parent);
          await client.setPostParent(projectId, postId, newParentPostId);
          stopSpinner(true, "상위 업무 변경 완료");
        } catch (err) {
          stopSpinner(false, "상위 업무 변경 실패");
          process.stderr.write(
            "⚠  본문은 수정되었으나 상위 업무 변경에 실패했습니다. 본문 재실행 금지 — 웹 UI 또는 dooray post edit --parent 단독 재시도 권장.\n",
          );
          throw err;
        }
      }
    } else {
      // Interactive mode: $EDITOR
      if (mentionInputs.length > 0 || groupInputs.length > 0) {
        process.stderr.write(
          "⚠  --mention/--mention-group 은 --title/--body 와 함께 사용 시에만 적용됩니다.\n",
        );
      }
      if (linkInputs.length > 0) {
        process.stderr.write(
          "⚠  --link-task 는 --title/--body 와 함께 사용 시에만 적용됩니다.\n",
        );
      }
      if (opts.parent) {
        process.stderr.write(
          "⚠  --parent 는 --title/--body 와 함께 사용 시에만 적용됩니다.\n",
        );
      }
      // tag 관련 옵션은 nonInteractive 분기에서만 처리됨 (hasTagChange 가
      // nonInteractive 조건에 포함). 여기 도달은 hasTagChange=false 이므로
      // 경고 불요 — cc/parent 처럼 nonInteractive 조건에 미포함 옵션과 다름.
      const original = serializePostFrontmatter(post, members);
      const edited = await openInEditor(original);

      if (original === edited) {
        process.stdout.write("변경사항 없음\n");
        return;
      }

      const parsed = parsePostFrontmatter(edited);

      const attachmentsInteractive = (post.files ?? []).map((f) => ({ id: f.id, name: f.name }));
      await checkAndGuardDropped(post.body.content, parsed.body, attachmentsInteractive, !opts.confirm);

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

    process.stdout.write(`#${postNumber} 업무가 수정되었습니다.\n`);
  });
