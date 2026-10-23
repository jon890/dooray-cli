import { Command } from "commander";
import { basename } from "node:path";
import { getConfigOrThrow } from "../../../config/store.js";
import { DoorayApiClient } from "../../../api/client.js";
import { resolveMessengerChannel } from "../../../resolvers/messenger-channel.js";
import { checkOutputFile, saveDownload } from "../../../utils/download-target.js";
import { startSpinner, stopSpinner } from "../../../utils/spinner.js";
import type { OutputOptions } from "../../../formatters/table.js";
import { emitDownloadResult } from "../../../formatters/file-output.js";

export const messengerFileDownloadCommand = new Command("download")
  .description(
    "메신저 대화방에 올라온 파일 다운로드. 파일 id 는 `messenger logs` 의 참조 칸에서 얻는다. " +
      "공식 API 문서에 없는 endpoint 라 예고 없이 막힐 수 있다",
  )
  .argument("<channel>", "파일이 올라온 대화방 channelId 또는 이름 (부분일치). 스레드의 파일은 스레드 channelId 나 부모 대화방")
  .argument("<fileId>", "파일 ID")
  .option("-o, --output <dir>", "저장 디렉토리", ".")
  .option("--output-file <path>", "저장할 파일 경로 (지정하면 -o, --output 는 무시)")
  .action(async (channel: string, fileId: string, opts: { output: string; outputFile?: string }) => {
    const globalOpts = messengerFileDownloadCommand.optsWithGlobals() as OutputOptions;
    await checkOutputFile({
      command: messengerFileDownloadCommand,
      dirKey: "output",
      dirFlag: "--output",
      outputFile: opts.outputFile,
    });
    const config = await getConfigOrThrow();
    const client = new DoorayApiClient(config.apiKey, config.baseUrl);

    const channelId = await resolveMessengerChannel(client, channel);

    startSpinner("파일 다운로드 중...");
    try {
      // 클라이언트가 이미 basename·NFC 로 정리한 이름이다 (ADR-067)
      const { buffer, fileName } = await client.downloadMessengerFile(channelId, fileId);
      const outputPath = await saveDownload(
        {
          command: messengerFileDownloadCommand,
          dirKey: "output",
          dirFlag: "--output",
          dirValue: opts.output,
          outputFile: opts.outputFile,
          fileName,
        },
        new Uint8Array(buffer),
      );
      stopSpinner(true, "다운로드 완료");

      // ADR-031: --json / --quiet / plain 3 모드 분기
      emitDownloadResult(globalOpts, { outputPath, fileName: basename(outputPath), size: buffer.byteLength });
    } catch (e) {
      stopSpinner(false);
      throw e;
    }
  });
