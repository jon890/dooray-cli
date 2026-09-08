import { Command } from "commander";
import { getConfigOrThrow } from "../../config/store.js";
import { DoorayApiClient } from "../../api/client.js";
import { resolveMessengerChannel } from "../../resolvers/messenger-channel.js";
import { openInEditor } from "../../editor/index.js";
import { readBodyInputOrNull } from "../../utils/body-input.js";
import { checkThreadOptions } from "./thread-options.js";
import type { OutputOptions } from "../../formatters/table.js";
import { printJson } from "../../formatters/table.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { DoorayCliError } from "../../utils/errors.js";
import { EXIT_API_ERROR, EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";

export const messengerThreadSendCommand = new Command("thread-send")
  .description("메신저 대화방에 스레드를 열어 전송 (--body 없으면 $EDITOR)")
  .option("--channel <channelId|이름>", "대화방 channelId 또는 이름 (부분일치)")
  .option("--log <log-id>", "이 메시지에 스레드를 연다. 생략하면 새 메시지를 보내며 연다")
  .option("--body <text>", "대화방에 보낼 본문 (- 입력 시 stdin에서 읽기)")
  .option("--body-file <path>", "본문 파일 경로 (- 입력 시 stdin에서 읽기)")
  .option("--thread-body <text>", "스레드 첫 메시지 (- 입력 시 stdin에서 읽기)")
  .option("--thread-body-file <path>", "스레드 첫 메시지 파일 경로 (- 입력 시 stdin에서 읽기)")
  .action(async (opts) => {
    if (!opts.channel) {
      throw new DoorayCliError("--channel 옵션은 필수입니다.", EXIT_PARAM_ERROR);
    }

    const check = checkThreadOptions(opts);
    if (check.error) {
      throw new DoorayCliError(check.error, EXIT_PARAM_ERROR);
    }
    for (const warning of check.warnings) {
      process.stderr.write(`경고: ${warning}\n`);
    }

    const globalOpts = messengerThreadSendCommand.optsWithGlobals() as OutputOptions;
    const config = await getConfigOrThrow();
    const client = new DoorayApiClient(config.apiKey, config.baseUrl);

    const channelId = await resolveMessengerChannel(client, opts.channel);

    let bodyContent = await readBodyInputOrNull(opts);
    if (bodyContent == null) {
      bodyContent = await openInEditor("");
    }
    if (!bodyContent.trim()) {
      throw new DoorayCliError("빈 메시지는 전송할 수 없습니다.", EXIT_PARAM_ERROR);
    }

    // 스레드 첫 메시지는 선택이다. 생략을 허용하기 위해 에디터를 열지 않는다.
    const threadBodyContent = await readBodyInputOrNull({
      body: opts.threadBody,
      bodyFile: opts.threadBodyFile,
    });

    startSpinner("스레드 생성 중...");
    try {
      const res = opts.log
        ? await client.createLogThread(channelId, opts.log, bodyContent)
        : await client.createChannelThread(
            channelId,
            bodyContent,
            threadBodyContent ?? undefined,
          );
      stopSpinner(
        true,
        `스레드를 열었습니다 (log-id: ${res.result.id}, thread-channel-id: ${res.result.channelId})`,
      );
      if (globalOpts.json) {
        printJson(res.result);
      } else if (globalOpts.quiet) {
        if (!res.result.channelId) {
          throw new DoorayCliError(
            "응답에 channelId가 없어 --quiet로 출력할 값이 없습니다.",
            EXIT_API_ERROR,
          );
        }
        process.stdout.write(`${res.result.channelId}\n`);
      } else {
        process.stdout.write(
          `스레드를 열었습니다 (log-id: ${res.result.id}, thread-channel-id: ${res.result.channelId})\n`,
        );
      }
    } catch (e) {
      stopSpinner(false);
      throw e;
    }
  });
