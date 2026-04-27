import { Command } from "commander";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { getConfigOrThrow } from "../../../config/store.js";
import { DoorayApiClient } from "../../../api/client.js";
import { resolvePostInput } from "../../../resolvers/post-input.js";
import { startSpinner, stopSpinner } from "../../../utils/spinner.js";

export const fileDownloadAllCommand = new Command("download-all")
  .description("업무의 모든 첨부파일 다운로드")
  .argument("[project]", "프로젝트 코드 (또는 첫 인자에 Dooray URL)")
  .argument("[post-number]", "업무 번호 (project와 함께 사용)")
  .option("--id <postId>", "Dooray post ID (project/post-number 대신)")
  .option("--url <url>", "Dooray 업무 URL (project/post-number 대신)")
  .option("-o, --output <dir>", "저장 디렉토리", ".")
  .action(async (project, postNumberStr, opts) => {
    const config = await getConfigOrThrow();
    const client = new DoorayApiClient(config.apiKey, config.baseUrl);

    const spinner = startSpinner("첨부파일 목록 조회 중...");
    const { projectId, postId } = await resolvePostInput(client, {
      projectArg: project,
      postNumberArg: postNumberStr,
      idOpt: opts.id,
      urlOpt: opts.url,
    });
    const res = await client.getPostFiles(projectId, postId);

    if (res.result.length === 0) {
      stopSpinner(true, "첨부파일 없음");
      process.stdout.write("첨부파일이 없습니다.\n");
      return;
    }

    await mkdir(opts.output, { recursive: true });

    const downloaded: string[] = [];
    for (const file of res.result) {
      spinner.text = `다운로드 중: ${file.name} (${downloaded.length + 1}/${res.result.length})`;
      const { buffer, fileName } = await client.downloadPostFile(projectId, postId, file.id);
      const outputPath = join(opts.output, fileName);
      await writeFile(outputPath, Buffer.from(buffer));
      downloaded.push(outputPath);
    }
    stopSpinner(true, `${downloaded.length}개 파일 다운로드 완료`);

    for (const path of downloaded) {
      process.stdout.write(`${path}\n`);
    }
  });
