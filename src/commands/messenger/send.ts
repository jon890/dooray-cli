import { Command } from "commander";
import { getConfigOrThrow } from "../../config/store.js";
import { DoorayApiClient } from "../../api/client.js";
import { resolveMemberByIdOrEmail } from "../../resolvers/member.js";
import { openInEditor } from "../../editor/index.js";
import { readBodyInputOrNull } from "../../utils/body-input.js";
import type { OutputOptions } from "../../formatters/table.js";
import { printJson, printQuiet } from "../../formatters/table.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { DoorayCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";

export const messengerSendCommand = new Command("send")
  .description("메신저 1:1 다이렉트 메시지 전송 (--body 없으면 $EDITOR)")
  .option("--to <id|email>", "받는 사람 (organizationMemberId 또는 이메일 — 이름 미지원)")
  .option("--body <text>", "메시지 본문 (- 입력 시 stdin에서 읽기)")
  .option("--body-file <path>", "본문 파일 경로 (- 입력 시 stdin에서 읽기)")
  .action(async (opts) => {
    if (!opts.to) {
      throw new DoorayCliError("--to 옵션은 필수입니다.", EXIT_PARAM_ERROR);
    }

    const globalOpts = messengerSendCommand.optsWithGlobals() as OutputOptions;
    const config = await getConfigOrThrow();
    const client = new DoorayApiClient(config.apiKey, config.baseUrl);

    const memberId = await resolveMemberByIdOrEmail(client, opts.to);
    if (memberId == null) {
      throw new DoorayCliError(
        `--to 는 organizationMemberId 또는 이메일만 지원합니다 (이름 미지원): "${opts.to}"`,
        EXIT_PARAM_ERROR,
      );
    }

    let bodyContent = await readBodyInputOrNull(opts);
    if (bodyContent == null) {
      bodyContent = await openInEditor("");
      if (!bodyContent.trim()) {
        process.stdout.write("빈 메시지는 전송할 수 없습니다.\n");
        return;
      }
    }

    startSpinner("메시지 전송 중...");
    try {
      const res = await client.sendDirectMessage(memberId, bodyContent);
      stopSpinner(true, `메시지를 전송했습니다 (log-id: ${res.result.id})`);
      if (globalOpts.json) {
        printJson(res.result);
      } else if (globalOpts.quiet) {
        printQuiet([res.result.id]);
      } else {
        process.stdout.write(`메시지를 전송했습니다 (log-id: ${res.result.id})\n`);
      }
    } catch (e) {
      stopSpinner(false);
      throw e;
    }
  });
