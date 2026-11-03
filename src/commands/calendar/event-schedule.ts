/**
 * 일정 쓰기 명령의 `--start`·`--end` 를 서버에 보낼 `startedAt`·`endedAt`·`wholeDayFlag` 로 확정하는 순수 함수.
 *
 * 날짜만 주면 종일 일정이다. 사용자는 마지막 날을 포함해서 주고, 서버의 `endedAt` 은 그 날을 포함하지 않으므로
 * 마지막 날 + 1일로 보낸다. 형식은 `2026-09-18+09:00` 처럼 날짜에 그 날짜의 지역 offset 을 붙인다.
 * offset 이 붙은 일시는 일반 일정이고 받은 문자열을 그대로 보낸다. 형식·실재성·순서는 API 를 부르기 전에 검증한다.
 */

import { DoorayCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
import {
  addDays,
  DAY_END,
  expandLocalDate,
  formatLocalDateWithOffset,
  isDateOnlyForm,
  type LocalDate,
  parseIsoInstant,
  parseLocalDate,
} from "../../utils/local-date.js";

export interface EventSchedule {
  startedAt: string;
  endedAt: string;
  wholeDayFlag: boolean;
}

type ParsedValue = { kind: "date"; date: LocalDate } | { kind: "datetime"; value: string };

function unreadable(flag: string, value: string): DoorayCliError {
  return new DoorayCliError(
    `${flag} 값을 읽을 수 없습니다: "${value}" ` +
      `(YYYY-MM-DD 또는 2026-09-20T09:00:00+09:00 처럼 offset 을 붙인 일시로 주세요)`,
    EXIT_PARAM_ERROR,
  );
}

/** 날짜만인지 offset 붙은 일시인지 가른다. 어느 쪽도 아니거나 실재하지 않는 값이면 오류다. */
function parseValue(flag: string, value: string): ParsedValue {
  if (isDateOnlyForm(value)) {
    const date = parseLocalDate(value);
    if (date == null) throw unreadable(flag, value);
    return { kind: "date", date };
  }
  // offset 없는 일시(`2026-09-20T09:00:00`)도 여기서 걸린다. 서버는 형식 검증 없이 500 을 낸다.
  if (parseIsoInstant(value) == null) throw unreadable(flag, value);
  return { kind: "datetime", value };
}

function compareDates(a: LocalDate, b: LocalDate): number {
  return a.year - b.year || a.month - b.month || a.day - b.day;
}

function mixedForm(): DoorayCliError {
  return new DoorayCliError(
    "--start 와 --end 는 둘 다 날짜만(종일 일정)이거나 둘 다 일시(일반 일정)여야 합니다.",
    EXIT_PARAM_ERROR,
  );
}

/**
 * `--start`·`--end` 를 일정 시각으로 바꾼다.
 *
 * - 둘 다 없으면 `null` (수정에서 시각을 건드리지 않는 경우). 생성은 부르는 쪽이 `--start` 를 먼저 요구한다.
 * - `--end` 만 주면 오류다. 끝만 옮기려면 기존 시작을 알아야 하는데 조회하지 않는다.
 * - 종일: 생성에서 `--end` 를 생략하면 시작과 같은 날 하루. 마지막 날이 시작보다 앞서면 오류.
 *   수정에서는 `--end` 가 필수다. 기존 기간을 조회하지 않으므로 생략을 하루로 보면 여러 날 일정이 조용히 하루로 줄어든다.
 * - 일반: `--end` 가 필수이고 시작보다 뒤여야 한다. 길이 0 인 일정은 받지 않는다.
 */
export function resolveEventSchedule(
  start: string | undefined,
  end: string | undefined,
  mode: "create" | "edit" = "create",
): EventSchedule | null {
  if (start == null && end == null) return null;
  if (start == null) {
    throw new DoorayCliError(
      "--end 만 줄 수 없습니다. 시각을 바꾸려면 --start 를 함께 주세요.",
      EXIT_PARAM_ERROR,
    );
  }

  const first = parseValue("--start", start);
  const last = end == null ? null : parseValue("--end", end);

  if (first.kind === "date") {
    if (last == null && mode === "edit") {
      throw new DoorayCliError(
        "수정에서는 종일 일정도 --end 를 함께 주세요. 하루 일정이면 --end 에 같은 날짜를 줍니다.\n" +
          "기존 기간을 읽지 않으므로 --start 만 주면 여러 날 일정이 하루로 바뀝니다.",
        EXIT_PARAM_ERROR,
      );
    }
    if (last != null && last.kind !== "date") throw mixedForm();
    const lastDate = last?.date ?? first.date;
    if (compareDates(lastDate, first.date) < 0) {
      throw new DoorayCliError(
        `--end 가 --start 보다 앞입니다: ${start} > ${end}`,
        EXIT_PARAM_ERROR,
      );
    }
    return {
      startedAt: formatLocalDateWithOffset(first.date),
      // 서버의 종일 endedAt 은 그 날을 포함하지 않는다. 사용자가 준 마지막 날의 다음 날로 보낸다.
      endedAt: formatLocalDateWithOffset(addDays(lastDate, 1)),
      wholeDayFlag: true,
    };
  }

  if (last == null) {
    throw new DoorayCliError(
      "일시로 준 --start 에는 --end 가 필요합니다. 종일 일정이면 날짜만(YYYY-MM-DD) 주세요.",
      EXIT_PARAM_ERROR,
    );
  }
  if (last.kind !== "datetime") throw mixedForm();
  // offset 이 서로 달라도 시각으로 견준다. 보낼 문자열은 받은 그대로 둔다.
  if (Date.parse(last.value) <= Date.parse(first.value)) {
    throw new DoorayCliError(
      `--end 가 --start 보다 뒤여야 합니다: ${start} >= ${end}`,
      EXIT_PARAM_ERROR,
    );
  }
  return { startedAt: first.value, endedAt: last.value, wholeDayFlag: false };
}

/**
 * `--repeat-until` 을 서버에 보낼 값으로 바꾼다.
 *
 * 공식 문서는 `datetime` 이라고만 적는다. 날짜만 주면 그 날 23:59:59 지역 시각으로 넓혀
 * 그 날 시작하는 반복까지 포함되게 한다. 서버는 넓힌 값을 그대로 저장하고 마지막 날의 회차까지 포함한다(실측).
 */
export function resolveRepeatUntil(value: string): string {
  const parsed = parseValue("--repeat-until", value);
  return parsed.kind === "date" ? expandLocalDate(parsed.date, DAY_END) : parsed.value;
}
