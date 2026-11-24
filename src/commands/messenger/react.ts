/** `dooray messenger react` — 메시지에 내 리액션을 달거나 뗀다. */
import { Command } from "commander";
import { runWebOnlyCommand } from "@/commands/web-support.js";
import { printJson, type OutputOptions } from "@/formatters/table.js";
import { resolveMessengerChannel } from "@/resolvers/messenger-channel.js";
import { DoorayCliError } from "@/utils/errors.js";
import { EXIT_PARAM_ERROR } from "@/utils/exit-codes.js";
import { normalizeReactionName } from "@/utils/reaction-name.js";

const SUPPORTED_NAMES = [
  "+1", "heart", "smile", "joy", "clap", "pray", "ok_hand", "raised_hands", "tada", "eyes", "white_check_mark", "100",
];

export const messengerReactCommand = new Command("react")
  .description(
    "저장한 웹 세션으로 메신저 메시지에 리액션을 달거나 뗍니다. API 키 방식에서도 쓸 수 있습니다. " +
    "공식 API 문서에 없는 경로라 예고 없이 막힐 수 있습니다.",
  )
  .argument("<channel>", "대화방 이름 또는 ID")
  .argument("<messageId>", "messenger logs 에 나온 메시지 ID")
  .requiredOption("--emoji <name>", "이모지 대표 이름")
  .option("--remove", "내가 단 리액션을 뗍니다")
  .addHelpText("after", [
    "",
    `지원하는 이름: ${SUPPORTED_NAMES.join(", ")}`,
    "별칭(예: thumbsup)과 지원 목록에 없는 이름은 거절합니다.",
    "세션은 dooray config set session-cookie - 로 저장합니다.",
    "",
    "예시",
    "  dooray messenger react <channel> <messageId> --emoji +1",
    "  dooray messenger react <channel> <messageId> --emoji +1 --remove",
  ].join("\n"))
  .action(async (channel: string, messageId: string, options: { emoji: string; remove?: boolean }, command: Command) => {
    if (!/^\d{15,}$/.test(messageId)) {
      throw new DoorayCliError("messenger logs 에 나온 숫자 메시지 ID를 입력하세요.", EXIT_PARAM_ERROR);
    }
    const emoji = normalizeReactionName(options.emoji);
    if (!SUPPORTED_NAMES.includes(emoji)) {
      throw new DoorayCliError("지원 목록에 없는 이모지 이름입니다. dooray messenger react --help 에서 이름을 확인하세요.", EXIT_PARAM_ERROR);
    }

    const remove = Boolean(options.remove);
    const channelId = await runWebOnlyCommand(command, async (client) => {
      const id = await resolveMessengerChannel(client, channel);
      if (remove) await client.removeMessengerReaction(id, messageId, emoji);
      else await client.addMessengerReaction(id, messageId, emoji);
      return id;
    }, { sessionErrorInWebMode: true });

    const output = command.optsWithGlobals() as OutputOptions;
    if (output.json) {
      printJson({ channelId, messageId, emoji, status: remove ? "removed" : "added" });
    } else if (output.quiet) {
      process.stdout.write(`${messageId}\n`);
    } else {
      process.stdout.write(`${remove ? "리액션을 뗐습니다" : "리액션을 달았습니다"} (${emoji}, 메시지 ${messageId})\n`);
    }
  });
