/**
 * `dooray stream list` — 내 두레이 활동(피드) 목록. `GET common/v1/streams`.
 *
 * 옵션을 읽어 `feed.ts` 의 `fetchStreams` 를 부르고 결과를 표·JSON·quiet 로 낸다.
 * 서버가 주는 범위와 커서·원소 읽기 규칙은 `feed.ts` 의 머리말을 본다.
 */

import { Command } from "commander";
import { getConfigOrThrow } from "../../config/store.js";
import { createClient } from "../../api/dooray-client.js";
import type { OutputOptions } from "../../formatters/table.js";
import { output, printJson, truncate } from "../../formatters/table.js";
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
  fetchStreams,
  type FetchStreamsResult,
  MAX_PAGES,
  streamItemAt,
  streamItemAuthor,
  streamItemId,
  streamItemSummary,
} from "./feed.js";

export const DEFAULT_SIZE = 20;
// 공식 문서의 size 최댓값.
export const MAX_SIZE = 200;
/** 페이지를 넘길 때(`--all`·`--since`) `--size` 를 주지 않으면 쓰는 크기. 호출 수를 줄인다. */
export const PAGING_SIZE = MAX_SIZE;

const PREV_DAYS = /^prev-([1-9]\d*)d$/;

interface StreamListOptions {
  size?: string;
  before?: string;
  since?: string;
  unread?: boolean;
  all?: boolean;
}

function paramError(message: string): DoorayCliError {
  return new DoorayCliError(message, EXIT_PARAM_ERROR);
}

export function parseSize(value: string | undefined, paging = false): number {
  if (value == null) return paging ? PAGING_SIZE : DEFAULT_SIZE;
  if (!/^\d+$/.test(value)) throw paramError(`--size 는 1~${MAX_SIZE} 사이 정수입니다: "${value}"`);
  const n = Number(value);
  if (n < 1 || n > MAX_SIZE) throw paramError(`--size 는 1~${MAX_SIZE} 사이 정수입니다: "${value}"`);
  return n;
}

/**
 * `--since` 를 epoch 밀리초로 바꾼다.
 * `YYYY-MM-DD` 는 그 날 로컬 00:00:00, offset 붙은 ISO8601 은 그 시각, `prev-<N>d` 는 지금에서 N×24시간 전이다.
 */
export function resolveSinceMs(value: string, now: number = Date.now()): number {
  const prev = PREV_DAYS.exec(value);
  if (prev) return now - Number(prev[1]) * 24 * 60 * 60 * 1000;
  if (isDateOnlyForm(value)) {
    const date = parseLocalDate(value);
    if (date != null) return Date.parse(expandLocalDate(date, DAY_START));
  } else if (parseIsoInstant(value) != null) {
    return Date.parse(value);
  }
  throw paramError(
    `--since 값을 읽을 수 없습니다: "${value}" ` +
      `(YYYY-MM-DD, 2026-09-20T09:00:00+09:00, prev-<N>d(N 은 1 이상) 중 하나로 주세요)`,
  );
}

export const streamListCommand = new Command("list")
  .description("내 두레이 활동(피드) 목록. 최근 2주, 최신순")
  .option(
    "--size <n>",
    `한 번에 받을 건수 (기본 ${DEFAULT_SIZE}, --all·--since 면 ${PAGING_SIZE}, 최대 ${MAX_SIZE})`,
  )
  .option("--before <cursor>", "이 커서보다 오래된 것부터 (직전 출력이 알려준 다음 커서)")
  .option("--since <date>", "이 시각 이후 활동만, 거기까지 페이지를 넘긴다 (YYYY-MM-DD, offset 붙은 ISO8601, prev-<N>d)")
  .option("--unread", "읽지 않은 것만")
  .option("--all", "빈 페이지가 올 때까지 끝까지 넘긴다")
  .action(async (opts: StreamListOptions) => {
    const globalOpts = streamListCommand.optsWithGlobals() as OutputOptions;

    // 검증은 설정 조회·API 호출 전에 둔다.
    const size = parseSize(opts.size, opts.all === true || opts.since != null);
    const sinceMs = opts.since != null ? resolveSinceMs(opts.since) : undefined;
    if (opts.before != null && !/^\d+$/.test(opts.before)) {
      throw paramError(`--before 는 직전 출력의 커서(숫자)입니다: "${opts.before}"`);
    }

    const config = await getConfigOrThrow();
    const client = createClient(config);

    startSpinner("활동 조회 중...");
    let result: FetchStreamsResult;
    try {
      result = await fetchStreams(client, {
        size,
        before: opts.before,
        read: opts.unread ? false : undefined,
        sinceMs,
        all: opts.all,
      });
    } catch (e) {
      stopSpinner(false);
      throw e;
    }
    const { items, nextCursor, truncated } = result;
    stopSpinner(true, items.length > 0 ? "조회 완료" : "활동 없음");

    // 이어 받는 방법은 stderr 로 알린다. stdout 은 데이터만 둔다.
    if (truncated) {
      process.stderr.write(
        `⚠  페이지 ${MAX_PAGES}개에서 멈췄습니다. --before ${nextCursor} 로 이어 받을 수 있습니다.\n`,
      );
    } else if (nextCursor && !opts.all && sinceMs == null) {
      process.stderr.write(`ℹ  다음 페이지: --before ${nextCursor}\n`);
    }

    if (globalOpts.json) {
      // API result 원소를 바꾸지 않고 배열로 낸다.
      printJson(items);
      return;
    }

    const ids = items.map(streamItemId).filter((id): id is string => !!id);
    if (globalOpts.quiet) {
      if (ids.length > 0) output(globalOpts, { headers: [], rows: [], raw: items, ids });
      return;
    }

    if (items.length === 0) {
      process.stdout.write("조건에 맞는 활동이 없습니다.\n");
      return;
    }

    // 서버가 준 문자열은 외부 통제 값이라 출력 직전 control char 를 없앤다.
    const rows = items.map((item) => [
      sanitizeForTerminal(formatSentAt(streamItemAt(item))),
      sanitizeForTerminal(item.type ?? ""),
      sanitizeForTerminal(streamItemAuthor(item)),
      sanitizeForTerminal(truncate(streamItemSummary(item), 60)),
    ]);
    output(globalOpts, {
      headers: ["시각", "타입", "작성자", "제목·내용"],
      rows,
      raw: items,
      ids,
    });
  });
