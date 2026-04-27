import { Command } from "commander";
import { getConfigOrThrow } from "../../config/store.js";
import { DoorayApiClient } from "../../api/client.js";
import { resolvePostInput } from "../../resolvers/post-input.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";

export const postDoneCommand = new Command("done")
  .description("업무 완료 처리")
  .argument("[project]", "프로젝트 코드 (또는 첫 인자에 Dooray URL)")
  .argument("[post-number]", "업무 번호 (project와 함께 사용)")
  .option("--id <postId>", "Dooray post ID (project/post-number 대신)")
  .option("--url <url>", "Dooray 업무 URL (project/post-number 대신)")
  .action(async (project, postNumberStr, opts) => {
    const config = await getConfigOrThrow();
    const client = new DoorayApiClient(config.apiKey, config.baseUrl);

    startSpinner("업무 완료 처리 중...");
    const { projectId, postId, postNumber } = await resolvePostInput(client, {
      projectArg: project,
      postNumberArg: postNumberStr,
      idOpt: opts.id,
      urlOpt: opts.url,
    });
    await client.setPostDone(projectId, postId);
    stopSpinner(true, "업무 완료 처리 완료");

    process.stdout.write(`#${postNumber} 업무가 완료 처리되었습니다.\n`);
  });
