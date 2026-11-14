/**
 * `dooray calendar event delete` — 일정 삭제. `POST calendar/v1/calendars/{calendar-id}/events/{event-id}/delete`.
 *
 * 다른 삭제 명령과 같이 확인을 기본으로 하고 `-y`/`--yes` 로 생략한다. non-TTY 에서 `--yes` 가 없으면
 * 설정·resolver·API 호출 전에 끝난다. 확인 문구에 일정 제목과 시각을 보여주려고 상세를 조회하지만,
 * 그 조회는 확인 단계 안에서만 일어나므로 위 선차단 순서는 그대로다.
 * `--scope` 는 반복 일정에서 지울 범위다. 반복 일정의 한 회차 id 는 받은 그대로 경로에 넣는다.
 * 범위와 `deleteType` 의 대응, 반복 일정 원본 id 의 거부는 `event-delete-rules.ts` 가 갖는다.
 */

import { Command, Option } from "commander";
import { getConfigOrThrow } from "../../config/store.js";
import { createClient } from "../../api/dooray-client.js";
import type { CalendarEventDetail } from "@/api/calendar/types.js";
import type { OutputOptions } from "../../formatters/table.js";
import { emitDeleteResult } from "../../formatters/file-output.js";
import { resolveWritableCalendar } from "../../resolvers/calendar.js";
import { authorizeDeletion, promptDeletion } from "../../utils/delete-confirmation.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { instanceOriginalId } from "./event-request.js";
import {
  DELETE_SCOPES,
  type DeleteContext,
  type DeleteScope,
  describeEvent,
  rejectSeriesDeleteByThis,
  SCOPE_LABEL,
  summarizeEvent,
  toDeleteType,
} from "./event-delete-rules.js";

export const calendarEventDeleteCommand = new Command("delete")
  .description("일정 삭제")
  .argument("<calendar>", "캘린더 ID 또는 이름 (calendar list 로 확인)")
  .argument("<event-id>", "일정 ID (반복 일정의 한 회차는 <eventId>-20240228T013000Z 형태 그대로)")
  .addOption(
    new Option("--scope <scope>", "반복 일정에서 지울 범위 (this: 이 회차만, from-this: 이 회차부터, all: 전체)")
      .choices(DELETE_SCOPES)
      .default("this"),
  )
  .option("-y, --yes", "확인 없이 삭제 (자동화용)")
  .action(async (calendarInput: string, eventId: string, opts) => {
    const scope = opts.scope as DeleteScope;

    // 확인 단계와 본 흐름이 같은 client·캘린더를 쓴다. 설정 로드는 확인을 통과한 뒤나 확인 안에서만 일어난다.
    let ctx: DeleteContext | undefined;
    const load = async (): Promise<DeleteContext> => {
      if (ctx != null) return ctx;
      const config = await getConfigOrThrow();
      const client = createClient(config);
      const calendar = await resolveWritableCalendar(client, calendarInput);
      ctx = { client, calendar };
      return ctx;
    };

    // 원본 id 의 반복 전체 삭제는 확인을 묻기 전에 막는다. -y 로 확인을 건너뛰어도 API 전에 같은 판정을 한다.
    let guarded = false;
    const guard = async (loaded: DeleteContext): Promise<CalendarEventDetail | undefined> => {
      guarded = true;
      return rejectSeriesDeleteByThis(loaded, eventId, scope);
    };

    const confirmed = await authorizeDeletion(!!opts.yes, !!process.stdin.isTTY, async () => {
      const loaded = await load();
      const event = await guard(loaded);
      const summary = event != null ? summarizeEvent(event, eventId) : await describeEvent(loaded, eventId);
      // 반복이 아닌 일정이면 범위 문구가 필요 없다. 회차 id 의 this 는 그 회차만 지운다(실측).
      const scopeLabel =
        scope === "this" && instanceOriginalId(eventId) != null ? " 이 회차만 지웁니다." : SCOPE_LABEL[scope];
      return promptDeletion(`일정을 삭제할까요? ${summary}.${scopeLabel}`);
    });
    if (!confirmed) {
      process.stderr.write("취소되었습니다.\n");
      return;
    }

    const globalOpts = calendarEventDeleteCommand.optsWithGlobals() as OutputOptions;
    const loaded = await load();
    if (!guarded) await guard(loaded);
    const { client, calendar } = loaded;

    startSpinner("일정 삭제 중...");
    try {
      await client.deleteCalendarEvent(calendar.id, eventId, toDeleteType(scope));
    } catch (e) {
      stopSpinner(false);
      throw e;
    }
    stopSpinner(true, "삭제 완료");

    emitDeleteResult(globalOpts, {
      id: eventId,
      jsonKey: "eventId",
      message: `일정(${eventId})을 삭제했습니다.`,
    });
  });
