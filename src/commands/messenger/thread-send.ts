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
    //
    // `--log` 분기는 이 값을 쓰지 않는다. 그런데도 읽으면 없는 파일을 준 경우
    // 「무시됩니다」 경고를 낸 직후 ENOENT 로 죽는다. 경고와 동작이 어긋난다.
    const threadBodyContent = opts.log
      ? null
      : await readBodyInputOrNull({
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
      // `channelId` 는 타입상 optional 이다. 문구를 만들기 전에 한 곳에서 검증해
      // 세 출력 경로가 같은 실패로 모이게 한다. 검증을 quiet 경로에만 두면
      // 나머지 둘이 `thread-channel-id: undefined` 를 그대로 낸다.
      const threadChannelId = res.result.channelId;
      if (!threadChannelId) {
        throw new DoorayCliError(
          "응답에 channelId가 없어 스레드 채널을 특정할 수 없습니다.",
          EXIT_API_ERROR,
        );
      }

      const summary = `스레드를 열었습니다 (log-id: ${res.result.id}, thread-channel-id: ${threadChannelId})`;
      stopSpinner(true, summary);
      if (globalOpts.json) {
        printJson(res.result);
      } else if (globalOpts.quiet) {
        process.stdout.write(`${threadChannelId}\n`);
      } else {
        process.stdout.write(`${summary}\n`);
      }
    } catch (e) {
      stopSpinner(false);
      throw e;
    }
  });
