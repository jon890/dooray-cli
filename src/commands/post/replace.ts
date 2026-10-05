/**
 * `post replace` — 업무 본문에서 문자열 하나를 찾아 바꾼다.
 *
 * 본문 전체를 주지 않고 바꿀 구간만 준다. 내부적으로는 현재 본문을 GET 해 치환한 뒤
 * 전체를 PUT 하며, 제목·우선순위·마감·참여자·본문 형식은 `post edit` 과 같게 보존한다.
 * 별도 명령으로 둔 이유와 왕복의 한계는 ADR-065 가 소유한다.
 */
import { Command } from "commander";
import { getConfigOrThrow } from "../../config/store.js";
import { DoorayApiClient } from "../../api/client.js";
import { resolvePostInput } from "../../resolvers/post-input.js";
import type { CreatePostUser, PostDetail, PostUser } from "../../api/types.js";
import type { OutputOptions } from "../../formatters/table.js";
import { printJson } from "../../formatters/table.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { resolveBodyMimeType } from "../../utils/body-input.js";
import { checkAndGuardDropped } from "../../utils/attachment-check.js";
import { applyReplace, readReplaceInputs } from "../../utils/body-replace.js";
import { printReplacePreview } from "../../formatters/body-replace.js";

function toRequestUser(u: PostUser): CreatePostUser {
  return { type: u.type, member: u.member, emailUser: u.emailUser, group: u.group };
}

export const postReplaceCommand = new Command("replace")
  .description("업무 본문의 일부만 치환 (긴 본문에서 한두 군데를 고칠 때 edit 대신 사용)")
  .argument("[project]", "프로젝트 코드 (또는 첫 인자에 Dooray URL)")
  .argument("[post-number]", "업무 번호 (project와 함께 사용)")
  .option("--id <postId>", "Dooray post ID (project/post-number 대신)")
  .option("--url <url>", "Dooray 업무 URL (project/post-number 대신)")
  .option("--old <text>", "찾을 문자열 (공백·줄바꿈까지 정확히 일치, - 입력 시 stdin)")
  .option("--old-file <path>", "찾을 문자열 파일 경로 (- 입력 시 stdin)")
  .option("--new <text>", "바꿀 문자열 (빈 문자열이면 old 구간 삭제, - 입력 시 stdin)")
  .option("--new-file <path>", "바꿀 문자열 파일 경로 (- 입력 시 stdin)")
  .option("--all", "일치하는 곳을 모두 치환 (없으면 정확히 한 군데일 때만 치환)")
  .option("--dry-run", "API 수정 없이 바뀌는 줄만 출력")
  .option("--no-confirm", "누락 attachment 경고 시 confirm 없이 진행 (자동화용)")
  .action(async (project, postNumberStr, opts) => {
    // 입력 검증은 설정 조회·API 호출보다 먼저 한다. 거절할 호출에 왕복을 쓰지 않는다.
    const { oldText, newText } = await readReplaceInputs(opts);

    const config = await getConfigOrThrow();
    const client = new DoorayApiClient(config.apiKey, config.baseUrl);
    const globalOpts = postReplaceCommand.optsWithGlobals() as OutputOptions;

    // 대상 해석은 스피너 전에 한다. 입력 오류 메시지가 스피너 문자와 섞이지 않게 한다.
    const { projectId, postId, postNumber } = await resolvePostInput(client, {
      projectArg: project,
      postNumberArg: postNumberStr,
      idOpt: opts.id,
      urlOpt: opts.url,
      argv: process.argv.slice(2),
    });

    startSpinner("업무 조회 중...");
    let post: PostDetail;
    try {
      post = (await client.getPost(projectId, postId)).result;
      stopSpinner(true, "업무 조회 완료");
    } catch (e) {
      stopSpinner(false);
      throw e;
    }

    const current = post.body?.content ?? "";
    const result = applyReplace(current, oldText, newText, !!opts.all);
    const bodyMimeType = resolveBodyMimeType(post.body?.mimeType);

    if (opts.dryRun) {
      printReplacePreview(globalOpts, { postId }, result, bodyMimeType);
      return;
    }

    const attachments = (post.files ?? []).map((f) => ({ id: f.id, name: f.name }));
    await checkAndGuardDropped(current, result.content, attachments, !opts.confirm);

    // 첨부 누락 확인 프롬프트는 스피너가 없는 동안 끝난다. 수정 스피너는 그 뒤에 띄운다.
    startSpinner("업무 수정 중...");
    try {
      await client.updatePost(projectId, postId, {
        subject: post.subject,
        body: { mimeType: bodyMimeType, content: result.content },
        priority: post.priority,
        dueDate: post.dueDate,
        dueDateFlag: post.dueDateFlag,
        users: { to: post.users.to.map(toRequestUser), cc: post.users.cc.map(toRequestUser) },
      });
      stopSpinner(true, "업무 수정 완료");
    } catch (e) {
      stopSpinner(false);
      throw e;
    }

    if (globalOpts.json) {
      printJson({ postId, number: postNumber, replaced: result.replaced });
    } else if (globalOpts.quiet) {
      process.stdout.write(`${postId}\n`);
    } else {
      process.stdout.write(`#${postNumber} 업무 본문에서 ${result.replaced}군데를 치환했습니다.\n`);
    }
  });
