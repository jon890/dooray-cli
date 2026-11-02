/**
 * `dooray stream list` — 내 두레이 활동(피드) 목록. `GET common/v1/streams`.
 *
 * 서버는 요청 시각 기준 최근 2주만, 최신순으로 준다. 다음 페이지는 응답의 `cursor` 를 `before` 로 넘겨 받는다.
 * 응답 건수가 `size` 보다 적어도 끝이 아니다(공식 문서). 끝은 빈 배열로만 안다.
 * 원소는 `{ type, [type]: 모델 }` 이고 type 마다 모델이 달라, 표에 쓸 값만 아래 헬퍼가 꺼낸다.
 */

import { Command } from "commander";
import { getConfigOrThrow } from "../../config/store.js";
import { DoorayApiClient } from "../../api/client.js";
import type { StreamItem, StreamListResponse } from "../../api/types.js";
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

export const DEFAULT_SIZE = 20;
// 공식 문서의 size 최댓값.
export const MAX_SIZE = 200;
/** 페이지를 넘길 때(`--all`·`--since`) `--size` 를 주지 않으면 쓰는 크기. 호출 수를 줄인다. */
export const PAGING_SIZE = MAX_SIZE;
/**
 * 페이지를 넘기는 상한. 2주 내역 5천여 건이 200건씩 30페이지 안팎이었다(실측).
 * 서버가 커서를 끝없이 주는 이상 동작에도 명령이 끝나게 하려는 값이다.
 */
export const MAX_PAGES = 1000;

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

function record(value: unknown): Record<string, unknown> | undefined {
  return value != null && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

/** type 이름의 키에 든 모델. type 이 없거나 모델이 객체가 아니면 undefined. */
export function streamModel(item: StreamItem): Record<string, unknown> | undefined {
  return item.type ? record(item[item.type]) : undefined;
}

// 활동 시각으로 읽을 필드. 문서의 type 별 모델에서 발생·작성·발송 시각에 해당한다.
// schedule 의 startedAt 은 일정 시각이라 활동 시각이 아니어서 넣지 않는다.
const TIME_FIELDS = ["at", "createdAt", "updatedAt", "sentAt"] as const;

/** 원소의 활동 시각 문자열. 모델에 시각이 없으면 undefined. */
export function streamItemAt(item: StreamItem): string | undefined {
  const model = streamModel(item);
  if (!model) return undefined;
  for (const key of TIME_FIELDS) {
    const v = str(model[key]);
    if (v) return v;
  }
  return undefined;
}

/** 작성자·행위자 이름. `creator`, `users.from`, `actor` 순으로 찾고 member·emailUser 를 한 겹 벗긴다. */
export function streamItemAuthor(item: StreamItem): string {
  const model = streamModel(item);
  if (!model) return "";
  const candidates = [model.creator, record(model.users)?.from, model.actor];
  for (const c of candidates) {
    const who = record(c);
    if (!who) continue;
    const name =
      str(record(who.member)?.name) ?? str(record(who.emailUser)?.name) ?? str(who.name);
    if (name) return name;
  }
  return "";
}

/** 제목이 있으면 제목(프로젝트는 이름), 없으면 본문 앞부분. 줄바꿈은 공백으로 접는다. */
export function streamItemSummary(item: StreamItem): string {
  const model = streamModel(item);
  if (!model) return "";
  const text = str(model.subject) ?? str(model.name) ?? str(record(model.body)?.content) ?? "";
  return text.replace(/\s+/g, " ").trim();
}

function streamItemId(item: StreamItem): string | undefined {
  const id = streamModel(item)?.id;
  return typeof id === "string" || typeof id === "number" ? String(id) : undefined;
}

/**
 * `cursor` 를 epoch 밀리초로 읽는다. 문서 예시(`1781768002000000000`)는 나노초 timestamp 다.
 * 자릿수로 단위를 가린다. 읽을 수 없으면 undefined.
 */
export function cursorToMs(cursor: string | undefined): number | undefined {
  if (!cursor || !/^\d+$/.test(cursor)) return undefined;
  const digits = cursor.length;
  // 나노초 19자리, 마이크로초 16자리, 밀리초 13자리, 초 10자리 안팎이다.
  if (digits >= 18) return Number(cursor.slice(0, digits - 6));
  if (digits >= 15) return Number(cursor.slice(0, digits - 3));
  if (digits >= 12) return Number(cursor);
  return Number(cursor) * 1000;
}

function normalizeCursor(cursor: StreamListResponse["cursor"]): string | undefined {
  if (cursor == null) return undefined;
  const s = String(cursor);
  return s === "" ? undefined : s;
}

export interface FetchStreamsOptions {
  size: number;
  before?: string;
  read?: boolean;
  sinceMs?: number;
  all?: boolean;
}

export interface FetchStreamsResult {
  items: StreamItem[];
  /** 이어 받을 때 `--before` 로 넘길 커서. 끝(빈 배열)에 닿았으면 undefined. */
  nextCursor?: string;
  /** 페이지 상한에 걸려 끝까지 받지 못했는지. */
  truncated: boolean;
}

/**
 * 페이지를 넘기며 원소를 모은다.
 * - 기본: 한 페이지만 받는다.
 * - `all`: 빈 배열이 올 때까지 넘긴다.
 * - `sinceMs`: 응답 커서가 그보다 오래되면 멈춘다. 원소는 자기 시각이 그보다 오래되면 뺀다.
 *   멈춤을 원소 시각이 아니라 커서로 판단하는 것은, 원소 시각이 최신순에서 수십 초씩 어긋나기 때문이다(실측).
 *   시각이 없는 원소(schedule 등)는 그 페이지 커서가 since 이후일 때만 남긴다.
 */
export async function fetchStreams(
  client: Pick<DoorayApiClient, "getStreams">,
  opts: FetchStreamsOptions,
): Promise<FetchStreamsResult> {
  const items: StreamItem[] = [];
  let before = opts.before;
  const paging = opts.all || opts.sinceMs != null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await client.getStreams({ size: opts.size, before, read: opts.read });
    const received = res.result ?? [];
    const cursor = normalizeCursor(res.cursor);
    if (received.length === 0) return { items, truncated: false };

    let reachedSince = false;
    if (opts.sinceMs != null) {
      const sinceMs = opts.sinceMs;
      const cursorMs = cursorToMs(cursor);
      let olderItem = false;
      for (const item of received) {
        const at = streamItemAt(item);
        const ms = at ? Date.parse(at) : NaN;
        if (!Number.isNaN(ms)) {
          if (ms >= sinceMs) items.push(item);
          else olderItem = true;
        } else if (cursorMs == null || cursorMs >= sinceMs) {
          items.push(item);
        }
      }
      // 커서를 읽지 못하면 원소 시각으로 대신 판단한다.
      reachedSince = cursorMs != null ? cursorMs < sinceMs : olderItem;
    } else {
      items.push(...received);
    }

    // 커서가 없거나 그대로면 더 받을 방법이 없다.
    if (!paging || reachedSince || !cursor || cursor === before) {
      return { items, nextCursor: cursor, truncated: false };
    }
    before = cursor;
  }
  return { items, nextCursor: before, truncated: true };
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
    const client = new DoorayApiClient(config.apiKey, config.baseUrl);

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
