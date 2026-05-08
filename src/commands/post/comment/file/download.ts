import { Command } from "commander";
import { writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { getConfigOrThrow } from "../../../../config/store.js";
import { DoorayApiClient } from "../../../../api/client.js";
import { resolveCommentFileInput } from "../../../../resolvers/comment-file-input.js";
import { startSpinner, stopSpinner } from "../../../../utils/spinner.js";

export const downloadCommentFileCommand = new Command("download")
  .description(
    "댓글에 첨부된 파일 다운로드 (현재 comment-id 는 미사용 — 멘탈 모델 일관성, 미래 댓글 단위 권한 호환용)",
  )
  .argument("[arg1]", "프로젝트 코드, Dooray URL, 또는 (`--id`/`--url` 모드일 때) 댓글 ID")
  .argument("[arg2]", "업무 번호 또는 (`--id`/`--url` 모드일 때) 파일 ID")
  .argument("[arg3]", "댓글 ID (positional 모드)")
  .argument("[arg4]", "파일 ID (positional 모드)")
  .option("--id <postId>", "Dooray post ID (project/post-number 대신)")
  .option("--url <url>", "Dooray 업무 URL (project/post-number 대신)")
  .option("--comment-id <logId>", "댓글 ID (positional 대체)")
  .option("--file-id <fileId>", "파일 ID (positional 대체)")
  .option("--out <path>", "저장 경로 (미지정 시 현재 디렉토리에 원본 파일명으로 저장)", ".")
  .action(async (arg1, arg2, arg3, arg4, opts) => {
    const config = await getConfigOrThrow();
    const client = new DoorayApiClient(config.apiKey, config.baseUrl);

    // commentId 는 UX 일관성 목적으로 받지만 download API 호출에는 사용 안 함
    const { projectId, postId, secondary: fileId } = await resolveCommentFileInput(client, {
      arg1, arg2, arg3, arg4,
      idOpt: opts.id,
      urlOpt: opts.url,
      commentIdOpt: opts.commentId,
      secondaryOpt: opts.fileId,
      requireSecondary: true,
      secondaryLabel: { positional: "4번째", option: "--file-id", identifier: "<fileId>" },
    });

    startSpinner("파일 다운로드 중...");
    const { buffer, fileName } = await client.downloadPostFile(projectId, postId, fileId!);

    const safeName = basename(fileName);
    const outputPath = join(opts.out, safeName);
    await writeFile(outputPath, Buffer.from(buffer));
    stopSpinner(true, "다운로드 완료");

    process.stdout.write(`${outputPath}\n`);
  });
