/**
 * `dooray messenger channels` — 내가 속한 대화방 목록. `GET messenger/v1/channels`.
 *
 * `logs` 와 `channel-send --channel` 에 넘길 channelId 를 여기서 얻는다.
 * 옵션을 읽고 출력만 한다. 필터·정렬·표시명·검색 규칙은 `channel-list.ts` 가 갖는다 (ADR-066).
 */

import { Command, Option } from "commander";
import { getConfigOrThrow } from "../../config/store.js";
import { createClient } from "../../api/dooray-client.js";
import type { MessengerChannel } from "@/api/messenger/types.js";
import type { OutputOptions } from "../../formatters/table.js";
import { output, printJson } from "../../formatters/table.js";
import { formatSentAt } from "../../formatters/datetime.js";
import { sanitizeForTerminal } from "../../utils/sanitize.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { DoorayCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
import {
  DAY_START,
  expandLocalDate,
  isDateOnlyForm,
  parseIsoInstant,
  parseLocalDate,
} from "../../utils/local-date.js";
import {
  channelIds,
  channelKind,
  countExcludedByDefault,
  type ExcludedCounts,
  filterAndSortChannels,
  formatExcludedNotice,
  nameAndSearchChannels,
} from "./channel-list.js";

// 공식 문서의 type 네 값: direct(1:1), private(일반 채널), me(나와의 대화), bot(봇이 만든 채널).
export const CHANNEL_TYPES = ["direct", "private", "me", "bot"] as const;

interface ChannelsOptions {
  type?: (typeof CHANNEL_TYPES)[number];
  search?: string;
  since?: string;
  all?: boolean;
}

/**
 * `--since` 를 비교 기준 시각 문자열로 확정한다.
 * `YYYY-MM-DD` 는 그 날 로컬 00:00:00, offset 이 붙은 ISO8601 은 실재성을 본 뒤 그대로 쓴다.
 */
export function resolveSince(value: string): string {
  if (isDateOnlyForm(value)) {
    const date = parseLocalDate(value);
    if (date != null) return expandLocalDate(date, DAY_START);
  } else if (parseIsoInstant(value) != null) {
    return value;
  }
  throw new DoorayCliError(
    `--since 값을 읽을 수 없습니다: "${value}" ` +
      `(YYYY-MM-DD 또는 2026-09-20T09:00:00+09:00 형태로 주세요)`,
    EXIT_PARAM_ERROR,
  );
}

/** 앞뒤 공백을 뗀 검색어. 비면 전체가 걸리므로(셸 변수가 빈 경우) 거부한다. */
function resolveSearch(value: string | undefined): string | undefined {
  if (value == null) return undefined;
  const keyword = value.trim();
  if (keyword === "") {
    throw new DoorayCliError("--search 검색어가 비어 있습니다.", EXIT_PARAM_ERROR);
  }
  return keyword.toLowerCase();
}

export const messengerChannelsCommand = new Command("channels")
  .description(
    "내가 속한 메신저 대화방 목록 (updatedAt(수정 시각) 최신순). logs·channel-send 에 넘길 id 를 찾는다",
  )
  .addOption(
    new Option(
      "--type <type>",
      "대화방 종류 (direct: 1:1, private: 그룹, me: 나와의 대화, bot: 봇이 만든 방)",
    ).choices([...CHANNEL_TYPES]),
  )
  .option("--search <keyword>", "대화방 제목 부분일치 (대소문자 무시, 제목 없는 방은 참여자 이름으로)")
  .option(
    "--since <date>",
    "updatedAt(수정 시각)이 이 시각 이후인 방만 (YYYY-MM-DD 또는 offset 붙은 ISO8601)",
  )
  .option("--all", "보관된 방, 숨긴 방, status 가 normal 이 아닌 방(system·archived·deleted)도 포함")
  .action(async (opts: ChannelsOptions) => {
    const globalOpts = messengerChannelsCommand.optsWithGlobals() as OutputOptions;

    // 검증은 설정 조회·API 호출 전에 둔다.
    const sinceMs = opts.since != null ? Date.parse(resolveSince(opts.since)) : undefined;
    const keyword = resolveSearch(opts.search);

    const config = await getConfigOrThrow();
    const client = createClient(config);

    startSpinner("대화방 조회 중...");
    let channels: MessengerChannel[];
    let excluded: ExcludedCounts | undefined;
    try {
      const res = await client.getMessengerChannels();
      const received = res.result ?? [];
      channels = filterAndSortChannels(received, { type: opts.type, sinceMs, all: opts.all });
      if (!opts.all) excluded = countExcludedByDefault(received, { type: opts.type, sinceMs });
    } catch (e) {
      stopSpinner(false);
      throw e;
    }

    // 표는 이름 열에, --search 는 제목 없는 방의 매칭에 이름이 필요하다.
    // --json·--quiet 만 있으면 이름을 쓰지 않으므로 방마다 붙는 멤버 조회를 건너뛴다.
    const tableMode = !globalOpts.json && !globalOpts.quiet;
    let labels = new Map<MessengerChannel, string>();
    try {
      const named = await nameAndSearchChannels(client, channels, { keyword, tableMode });
      channels = named.channels;
      labels = named.labels;
    } catch (e) {
      stopSpinner(false);
      throw e;
    }

    stopSpinner(true, channels.length > 0 ? "조회 완료" : "대화방 없음");

    // 기본 제외로 빠진 방을 알린다. 빈 결과가 「방이 없다」 로 읽히지 않게 하는 것이 목적이라 stdout 은 그대로 둔다.
    const notice = excluded ? formatExcludedNotice(excluded, channels.length) : null;
    if (notice) process.stderr.write(notice);

    if (globalOpts.json) {
      // 서버 응답 원형 (필터·정렬만 적용) — 만든 표시명을 끼워넣지 않는다.
      printJson(channels);
      return;
    }

    if (globalOpts.quiet) {
      // 빈 배열에 printQuiet 를 부르면 빈 줄 하나가 나간다. 아무것도 내지 않는다.
      if (channels.length > 0) {
        output(globalOpts, { headers: [], rows: [], raw: channels, ids: channelIds(channels) });
      }
      return;
    }

    if (channels.length === 0) {
      process.stdout.write("조건에 맞는 대화방이 없습니다.\n");
      return;
    }

    const rows = channels.map((ch) => [
      // 서버가 준 문자열은 외부 통제 값이라 출력 직전 control char 를 없앤다.
      sanitizeForTerminal(labels.get(ch) ?? ""),
      sanitizeForTerminal(channelKind(ch.type)),
      // formatSentAt 은 형식이 다르면 원문을 그대로 돌려주므로 시각도 거친다.
      sanitizeForTerminal(formatSentAt(ch.updatedAt)),
      sanitizeForTerminal(ch.id ?? ""),
    ]);
    output(globalOpts, {
      headers: ["이름", "종류", "수정 시각", "id"],
      rows,
      raw: channels,
      ids: channelIds(channels),
    });
  });
