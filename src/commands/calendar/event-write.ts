/**
 * `calendar event create` 와 `calendar event edit` 이 함께 쓰는 옵션 정의와 입력 처리.
 *
 * 처리는 두 단계로 나뉜다. `prepareEventFields` 는 설정과 네트워크 없이 끝나는 검증과 본문 읽기를 맡고,
 * `resolveEventRequest` 는 참석자 이름을 id 로 바꿔 요청 본문을 완성한다.
 * 입력 실수가 config 로드나 API 호출보다 먼저 `EXIT_PARAM_ERROR` 로 끝나게 하려고 나눈다.
 */

import { Command, Option } from "commander";
import type { OutputOptions } from "../../formatters/table.js";
import type { DoorayApiClient } from "../../api/client.js";
import type { CalendarEventWriteRequest } from "../../api/types.js";
import { ensureMe } from "../../resolvers/me.js";
import { resolveOrganizationMember } from "../../resolvers/member.js";
import { BODY_MIME_TYPES, readBodyInput } from "../../utils/body-input.js";
import { DoorayCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
import {
  buildEventRequest,
  buildRecurrenceRule,
  EVENT_BODY_DEFAULT_MIME,
  type EventRequestMode,
  hasRepeatDetail,
  type EventRequestParts,
  localTimezoneName,
  parseAlarm,
  REPEAT_FREQUENCIES,
  type RepeatOptions,
} from "./event-request.js";
import { resolveEventSchedule } from "./event-schedule.js";

export interface EventFieldOptions extends RepeatOptions {
  title?: string;
  start?: string;
  end?: string;
  body?: string;
  bodyFile?: string;
  mimeType?: string;
  location?: string;
  to?: string[];
  cc?: string[];
  alarm?: string[];
  private?: boolean;
  dryRun?: boolean;
}

const collect = (value: string, prev: string[]): string[] => [...prev, value];

/** 생성과 수정이 같은 옵션을 받는다. 필수 여부는 각 명령이 action 에서 본다. */
export function addEventFieldOptions(command: Command): Command {
  return command
    .option("--title <title>", "일정 제목")
    .option(
      "--start <date|datetime>",
      "시작. YYYY-MM-DD 면 종일 일정, 2026-09-20T09:00:00+09:00 처럼 offset 을 붙인 일시면 일반 일정",
    )
    .option(
      "--end <date|datetime>",
      "끝. 종일 일정은 마지막 날(포함, 생략하면 시작과 같은 날), 일반 일정은 끝 일시(필수)",
    )
    .option("--body <text>", "본문 텍스트 (- 입력 시 stdin에서 읽기)")
    .option("--body-file <path>", "본문 파일 경로 (- 입력 시 stdin에서 읽기)")
    .addOption(
      new Option("--mime-type <type>", `본문 형식 (기본 ${EVENT_BODY_DEFAULT_MIME})`).choices(
        BODY_MIME_TYPES,
      ),
    )
    .option("--location <text>", "장소")
    .option("--to <members...>", "참석자 (organizationMemberId, 이메일, 정확한 이름, me — 여러 명 가능)")
    .option("--cc <members...>", "참조자 (organizationMemberId, 이메일, 정확한 이름, me — 여러 명 가능)")
    .option(
      "--alarm <spec>",
      "알림 ([mail:|app:]<숫자><m|h|d|w>, 예: 10m, mail:1d — 반복 가능, 기본 app)",
      collect,
      [] as string[],
    )
    .option("--private", "비공개 일정으로 표시")
    .option("--repeat <frequency>", `반복 (${REPEAT_FREQUENCIES.join(", ")})`)
    .option("--repeat-interval <n>", "반복 간격 (기본 1)")
    .option("--repeat-until <date|datetime>", "반복 종료 (날짜만 주면 그 날 23:59:59. 반복 일정을 고칠 때는 그 일정의 시간대 기준)")
    .option("--repeat-byday <value>", "반복 요일 (예: TH, 1 MO, -1 WE)")
    .option("--repeat-bymonth <list>", "반복 월 (1-12, 쉼표 목록 가능)")
    .option(
      "--repeat-bymonthday <list>",
      "반복 일 (1-31, 쉼표 목록 가능. 매월 18-24일 사이 목요일: --repeat monthly --repeat-byday TH --repeat-bymonthday 18,19,20,21,22,23,24)",
    )
    .option("--dry-run", "API 호출 없이 보낼 요청 본문 JSON 만 stdout 출력 (캘린더·멤버 이름 해석은 한다)");
}

/** 요청 필드를 만드는 옵션이 하나라도 있는지. `--dry-run` 과 `--mime-type` 은 그 자체로 필드를 만들지 않는다. */
export function hasEventFieldOption(opts: EventFieldOptions): boolean {
  return (
    opts.title != null ||
    opts.start != null ||
    opts.end != null ||
    opts.body != null ||
    opts.bodyFile != null ||
    opts.location != null ||
    opts.to != null ||
    opts.cc != null ||
    (opts.alarm ?? []).length > 0 ||
    opts.private === true ||
    opts.repeat != null ||
    hasRepeatDetail(opts)
  );
}

export interface PreparedEventFields {
  /** 참석자를 뺀 나머지. 참석자는 `resolveEventRequest` 가 채운다. */
  parts: EventRequestParts;
  toInputs?: string[];
  ccInputs?: string[];
}

/**
 * 앞뒤 공백을 떼고 빈 값을 버린다. 준 값이 모두 비면 오류다.
 * `--to ""` 를 참석자 비우기로 받으면 의도치 않게 참석자가 모두 빠질 수 있어, 비우는 동작은 두지 않는다.
 */
function cleanInputs(flag: string, values: string[] | undefined): string[] | undefined {
  if (values == null) return undefined;
  const cleaned = values.map((v) => v.trim()).filter((v) => v !== "");
  if (cleaned.length === 0) {
    throw new DoorayCliError(
      `${flag} 에 빈 값만 주었습니다. 참석자를 비우는 기능은 없습니다. 멤버를 하나 이상 주세요.`,
      EXIT_PARAM_ERROR,
    );
  }
  return cleaned;
}

/** `--dry-run` 은 요청 본문 JSON 만 내므로 전역 출력 옵션이 효력이 없다. 무시되는 옵션은 stderr 로 알린다. */
export function warnDryRunOutputOptions(globalOpts: OutputOptions): void {
  const ignored = [globalOpts.json && "--json", globalOpts.quiet && "--quiet"].filter(Boolean);
  if (ignored.length === 0) return;
  process.stderr.write(
    `⚠  --dry-run 은 요청 본문 JSON 만 출력하므로 ${ignored.join("·")} 을 무시합니다.\n`,
  );
}

/**
 * 네트워크 없이 끝나는 검증과 본문 읽기. 공백뿐인 제목, 빈 참석자 목록, 시각·알림·반복 형식 오류는
 * 여기서 `EXIT_PARAM_ERROR` 로 끝난다.
 *
 * `--mime-type` 을 줬는데 본문이 비어 있으면 효력이 없으므로 stderr 로 알리고 넘어간다.
 */
export async function prepareEventFields(
  opts: EventFieldOptions,
  mode: "create" | "edit",
): Promise<PreparedEventFields> {
  if (opts.title != null && opts.title.trim() === "") {
    throw new DoorayCliError("--title 이 비어 있습니다.", EXIT_PARAM_ERROR);
  }
  const toInputs = cleanInputs("--to", opts.to);
  const ccInputs = cleanInputs("--cc", opts.cc);
  const schedule = resolveEventSchedule(opts.start, opts.end, mode);
  const alarms = (opts.alarm ?? []).map(parseAlarm);
  const recurrenceRule = buildRecurrenceRule(opts, localTimezoneName());

  const bodyContent =
    opts.body == null && opts.bodyFile == null ? undefined : await readBodyInput(opts);
  const hasBody = bodyContent != null && bodyContent !== "";
  if (opts.mimeType != null && !hasBody) {
    process.stderr.write("⚠  본문이 없어 --mime-type 을 무시합니다.\n");
  }

  return {
    parts: {
      subject: opts.title,
      bodyContent,
      // 본문이 없으면 무시한다. 생성은 빈 본문을 싣는데, 그때도 기본 형식을 쓴다.
      mimeType: hasBody ? opts.mimeType : undefined,
      location: opts.location,
      schedule,
      alarms,
      isPrivate: opts.private === true,
      recurrenceRule,
    },
    toInputs,
    ccInputs,
  };
}

/**
 * 참석자·참조자 입력을 id 로 바꾸고 요청 본문을 완성한다. `mode` 는 생성과 수정의 필수 키 차이를 가른다.
 * 같은 사람을 두 번 적으면 한 번만 넣는다. `me` 는 여러 번 나와도 내 정보를 한 번만 조회한다.
 */
export async function resolveEventRequest(
  client: DoorayApiClient,
  prepared: PreparedEventFields,
  mode: EventRequestMode,
): Promise<CalendarEventWriteRequest> {
  let meId: Promise<string> | undefined;
  const getMeId = (): Promise<string> => (meId ??= ensureMe(client).then((me) => me.id));

  const resolveAll = async (inputs: string[] | undefined): Promise<string[] | undefined> => {
    if (inputs == null) return undefined;
    const ids: string[] = [];
    // 순서대로 푼다. 오류가 나면 사용자가 적은 순서에서 처음 틀린 값을 알린다.
    for (const input of inputs) {
      const id = await resolveOrganizationMember(client, input, getMeId);
      if (!ids.includes(id)) ids.push(id);
    }
    return ids;
  };

  const to = await resolveAll(prepared.toInputs);
  const cc = await resolveAll(prepared.ccInputs);
  return buildEventRequest({ ...prepared.parts, to, cc }, mode);
}
