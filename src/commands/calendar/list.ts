/**
 * `dooray calendar list` — 접근 가능한 캘린더 목록. `GET calendar/v1/calendars`.
 *
 * `event get` 에 넘길 calendar-id 를 여기서 얻는다.
 */

import { Command } from "commander";
import { getConfigOrThrow } from "../../config/store.js";
import { createClient } from "../../api/dooray-client.js";
import type { Calendar } from "../../api/types.js";
import type { OutputOptions } from "../../formatters/table.js";
import { output } from "../../formatters/table.js";
import { sanitizeForTerminal } from "../../utils/sanitize.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";

export const calendarListCommand = new Command("list")
  .description("접근 가능한 캘린더 목록 조회")
  .action(async () => {
    const globalOpts = calendarListCommand.optsWithGlobals() as OutputOptions;

    const config = await getConfigOrThrow();
    const client = createClient(config);

    startSpinner("캘린더 조회 중...");
    let calendars: Calendar[];
    try {
      const res = await client.getCalendars();
      calendars = res.result ?? [];
    } catch (e) {
      stopSpinner(false);
      throw e;
    }

    if (calendars.length === 0) {
      stopSpinner(true, "캘린더 없음");
      if (globalOpts.json) {
        output(globalOpts, { headers: [], rows: [], raw: calendars, ids: [] });
        return;
      }
      // 빈 배열에 printQuiet 를 부르면 빈 줄 하나가 나간다 (messenger logs 와 동일 처리).
      if (!globalOpts.quiet) process.stdout.write("캘린더가 없습니다.\n");
      return;
    }

    stopSpinner(true, "조회 완료");
    output(globalOpts, {
      headers: ["이름", "ID", "종류"],
      // 서버가 준 문자열은 외부 통제 값이라 출력 직전 control char 를 없앤다.
      rows: calendars.map((c) => [
        sanitizeForTerminal(c.name ?? ""),
        c.id,
        sanitizeForTerminal(c.type ?? ""),
      ]),
      raw: calendars,
      ids: calendars.map((c) => c.id),
    });
  });
