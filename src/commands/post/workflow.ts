import { Command } from "commander";
import { getConfigOrThrow } from "../../config/store.js";
import { DoorayApiClient } from "../../api/client.js";
import { resolvePostInput } from "../../resolvers/post-input.js";
import { resolveWorkflow } from "../../resolvers/workflow.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { DoorayCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
import { isLikelyDoorayUrl } from "../../utils/dooray-url.js";

export const postWorkflowCommand = new Command("workflow")
  .description("업무 워크플로우 변경")
  .argument("[project]", "프로젝트 코드 (또는 첫 인자에 Dooray URL)")
  .argument("[post-number]", "업무 번호 (project와 함께 사용)")
  .argument("[workflow]", "워크플로우 이름 또는 클래스 (또는 --workflow 사용)")
  .option("--id <postId>", "Dooray post ID (project/post-number 대신)")
  .option("--url <url>", "Dooray 업무 URL (project/post-number 대신)")
  .option("--workflow <name>", "워크플로우 이름 (positional 대체)")
  .action(async (project, postNumber, workflowArg, opts) => {
    const config = await getConfigOrThrow();
    const client = new DoorayApiClient(config.apiKey, config.baseUrl);

    // workflow 인자 결정
    let workflowInput: string | undefined = opts.workflow;
    let projectArg: string | undefined = project;
    let postNumberArg: string | undefined = postNumber;

    if (!workflowInput) {
      if (workflowArg) {
        // positional 3개 모드: project + post-number + workflow
        workflowInput = workflowArg;
      } else if ((opts.id || opts.url) && projectArg && !postNumberArg) {
        // --id/--url 모드 + positional 1개 → 그 positional이 workflow
        workflowInput = projectArg;
        projectArg = undefined;
      } else if (!opts.id && !opts.url && projectArg && postNumberArg && !workflowArg) {
        // URL positional 2-arg 모드: arg1=URL, arg2=workflow
        if (isLikelyDoorayUrl(projectArg)) {
          workflowInput = postNumberArg;
          postNumberArg = undefined;
        }
      }
    }

    if (!workflowInput) {
      throw new DoorayCliError(
        "workflow가 필요합니다. positional 또는 --workflow로 입력하세요.",
        EXIT_PARAM_ERROR,
      );
    }

    startSpinner("워크플로우 변경 중...");
    const { projectId, postId, postNumber: resolvedPostNumber } = await resolvePostInput(client, {
      projectArg,
      postNumberArg,
      idOpt: opts.id,
      urlOpt: opts.url,
    });
    const workflowId = await resolveWorkflow(client, projectId, workflowInput);
    await client.setPostWorkflow(projectId, postId, workflowId);
    stopSpinner(true, "워크플로우 변경 완료");

    process.stdout.write(`#${resolvedPostNumber} 워크플로우가 "${workflowInput}"(으)로 변경되었습니다.\n`);
  });
