/**
 * 두레이 활동(피드)의 원소를 읽는 규칙과 페이지를 넘겨 모으는 흐름. `stream list` 가 쓴다.
 *
 * 서버는 요청 시각 기준 최근 2주만, 최신순으로 준다. 다음 페이지는 응답의 `cursor` 를 `before` 로 넘겨 받는다.
 * 응답 건수가 `size` 보다 적어도 끝이 아니다(공식 문서). 끝은 빈 배열로만 안다.
 * 원소는 `{ type, [type]: 모델 }` 이고 type 마다 모델이 달라, 표에 쓸 값만 아래 헬퍼가 꺼낸다.
 */

import type { StreamClient, StreamItem, StreamListResponse } from "@/api/stream/types.js";

/**
 * 페이지를 넘기는 상한. 2주 내역 5천여 건이 200건씩 30페이지 안팎이었다(실측).
 * 서버가 커서를 끝없이 주는 이상 동작에도 명령이 끝나게 하려는 값이다.
 */
export const MAX_PAGES = 1000;

/**
 * `--since` 의 멈춤 판단에 두는 여유. 원소 시각이 최신순에서 최대 29초 어긋났다(실측).
 * 커서가 since 를 막 지난 페이지 다음에도 since 이후 원소가 올 수 있어, 그만큼 한 페이지 더 받는다.
 */
export const SINCE_STOP_MARGIN_MS = 60_000;

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

/**
 * 원소의 활동 시각 문자열. 시각 필드 가운데 가장 늦은 값을 쓴다.
 * 오래전에 만든 업무가 수정되어 피드에 다시 오면 `createdAt` 이 아니라 `updatedAt` 이 활동 시각이다.
 * 모델에 읽을 수 있는 시각이 없으면 undefined.
 */
export function streamItemAt(item: StreamItem): string | undefined {
  const model = streamModel(item);
  if (!model) return undefined;
  let latest: string | undefined;
  let latestMs = -Infinity;
  for (const key of TIME_FIELDS) {
    const v = str(model[key]);
    const ms = v ? Date.parse(v) : NaN;
    if (v && !Number.isNaN(ms) && ms > latestMs) {
      latest = v;
      latestMs = ms;
    }
  }
  return latest;
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

/**
 * 웹 `calendar`·`project` 카드의 행위자 id. 이름은 응답에 없어 명령이 멤버 조회로 채운다(ADR-083).
 * 공개 API `project` 원소는 `source` 대신 `actor` 를 가지므로 undefined 다.
 */
export function streamChangeSourceId(item: StreamItem): string | undefined {
  if (item.type !== "calendar" && item.type !== "project") return undefined;
  const id = record(streamModel(item)?.source)?.organizationMemberId;
  return typeof id === "string" || typeof id === "number" ? String(id) || undefined : undefined;
}

/** 상태 이름. `ko_KR` 이 없으면 첫 이름이다. */
function localizedName(value: unknown): string | undefined {
  const names = record(value)?.names;
  if (!Array.isArray(names)) return undefined;
  const ko = names.find((n) => record(n)?.locale === "ko_KR");
  return str(record(ko)?.name) ?? str(record(names[0])?.name);
}

/** 시스템 기록 한 건의 요약. 항목 이름은 `message` 의 「: 변경」 앞부분이다. 값을 읽지 못하면 `message` 로 둔다. */
function actionSummary(value: unknown): string {
  const action = record(value);
  if (!action) return "";
  const message = str(action.message);
  const fallback = message ?? str(action.name) ?? "";
  const sep = message?.indexOf(": ") ?? -1;
  const label = message ? (sep >= 0 ? message.slice(0, sep) : message) : str(action.name);
  const data = record(action.data);
  if (action.name === "workflow") {
    const before = localizedName(data?.before), after = localizedName(data?.after);
    return before && after ? `${label}: ${before} → ${after}` : fallback;
  }
  if (action.name === "endedAt") {
    const day = typeof data?.after === "string" ? /^\d{4}-\d{2}-\d{2}/.exec(data.after)?.[0] : undefined;
    return day ? `${label}: ${day}` : fallback;
  }
  if (action.name === "subject") {
    return typeof data?.before === "string" && typeof data.after === "string"
      ? `${label}: ${data.before} → ${data.after}`
      : fallback;
  }
  return fallback;
}

function joinActions(actions: unknown[], one: (action: unknown) => string): string {
  return actions.map(one).filter((s) => s !== "").join(", ");
}

/**
 * 변경 기록 원소의 요약(ADR-083). 변경 기록이 아니면 undefined.
 * 공개 API `project` 원소(`actor`·`action`)와 댓글 `event`(`body` 있음)는 변경 기록이 아니다.
 */
function changeSummary(item: StreamItem, model: Record<string, unknown>): string | undefined {
  if (item.type === "event" && Array.isArray(model.actions)) return joinActions(model.actions, actionSummary);
  const pageActions = record(model.body)?.actions;
  if (item.type === "pageEvent" && Array.isArray(pageActions)) {
    return joinActions(pageActions, (a) => str(record(a)?.message) ?? str(record(a)?.name) ?? "");
  }
  if (!("source" in model)) return undefined;
  if (item.type === "calendar") {
    const type = str(record(model.action)?.type);
    if (type !== "schedule_deleted") return type ?? "";
    const subject = str(record(record(model.target)?.schedule)?.subject);
    return subject ? `일정 삭제: ${subject}` : "일정 삭제";
  }
  if (item.type === "project") {
    const action = str(model.action) ?? str(record(model.actionDetail)?.type);
    if (action === "invited" || record(model.actionDetail)?.type === "invited") return "프로젝트 초대";
    return action ?? "";
  }
  return undefined;
}

/** 변경 기록은 바뀐 내용을, 그 밖에는 제목이 있으면 제목(프로젝트는 이름), 없으면 본문 앞부분. 줄바꿈은 공백으로 접는다. */
export function streamItemSummary(item: StreamItem): string {
  const model = streamModel(item);
  if (!model) return "";
  const text =
    changeSummary(item, model) ?? str(model.subject) ?? str(model.name) ?? str(record(model.body)?.content) ?? "";
  return text.replace(/\s+/g, " ").trim();
}

export function streamItemId(item: StreamItem): string | undefined {
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
  /** 웹 변경 기록을 `items` 에 함께 담는다(ADR-083). 클라이언트에 그대로 넘긴다. */
  withChanges?: boolean;
}

export interface FetchStreamsResult {
  items: StreamItem[];
  /** 이어 받을 때 `--before` 로 넘길 커서. 끝(빈 배열)에 닿았으면 undefined. */
  nextCursor?: string;
  /** 페이지 상한에 걸려 끝까지 받지 못했는지. */
  truncated: boolean;
  /** `withChanges` 가 아니어서 뺀 변경 기록 수. `--since` 를 통과한 것만 센다. 웹 방식만 0 보다 크다. */
  hiddenChanges: number;
  /** 웹 응답에서 CLI 가 모르는 항목 수. 웹 방식만 0 보다 크다. */
  unknown: number;
}

/**
 * 원소를 `--since` 로 판단한 결과. `keep` 은 남기고, `older` 는 원소 시각이 since 보다 앞서 빼고, `drop` 은 시각이 없고 페이지가 since 구간 밖이라 뺀다.
 * 시각이 없는 원소(schedule 등)는 그 페이지의 앞쪽 경계가 since 이후일 때만 남긴다.
 */
function sinceVerdict(item: StreamItem, sinceMs: number, pageOverlapsSince: boolean): "keep" | "older" | "drop" {
  const at = streamItemAt(item);
  const ms = at ? Date.parse(at) : NaN;
  if (!Number.isNaN(ms)) return ms >= sinceMs ? "keep" : "older";
  return pageOverlapsSince ? "keep" : "drop";
}

/** 페이지의 가장 새 쪽 경계(직전 커서)가 since 이후인지. 첫 페이지(before 없음)는 지금이다. since 가 미래면 첫 페이지도 구간 밖이다. */
function pageOverlapsSince(before: string | undefined, sinceMs: number): boolean {
  const newerEdgeMs = before != null ? cursorToMs(before) : Date.now();
  return newerEdgeMs == null || newerEdgeMs >= sinceMs;
}

/**
 * 페이지를 넘기며 원소를 모은다.
 * - 기본: 한 페이지만 받는다.
 * - `all`: 빈 배열이 올 때까지 넘긴다.
 * - `sinceMs`: 응답 커서가 그보다 여유(`SINCE_STOP_MARGIN_MS`) 이상 오래되면 멈춘다. 원소는 자기 시각이 그보다 오래되면 뺀다.
 *   멈춤을 원소 시각이 아니라 커서로 판단하는 것은, 원소 시각이 최신순에서 수십 초씩 어긋나기 때문이다(실측).
 *   시각이 없는 원소(schedule 등)는 그 페이지의 앞쪽 경계(직전 커서, 첫 페이지면 지금)가 since 이후일 때 남긴다.
 *   since 를 넘긴 첫 페이지에도 since 이후 원소가 섞여 있어, 거기 든 시각 없는 원소를 버리면 빠뜨린다.
 */
export async function fetchStreams(
  client: StreamClient,
  opts: FetchStreamsOptions,
): Promise<FetchStreamsResult> {
  const items: StreamItem[] = [];
  let hiddenChanges = 0;
  let unknown = 0;
  let before = opts.before;
  const paging = opts.all || opts.sinceMs != null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await client.getStreams({ size: opts.size, before, read: opts.read, withChanges: opts.withChanges });
    const received = res.result ?? [];
    const cursor = normalizeCursor(res.cursor);
    const cursorMs = cursorToMs(cursor);
    // 빈 페이지로 끝내기 전에 센다. 웹 구현은 변경 기록만 있던 페이지를 이어 받으며 건수를 모아 준다.
    const changes = res.changes ?? [];
    if (opts.sinceMs == null) {
      hiddenChanges += changes.length;
    } else {
      const sinceMs = opts.sinceMs;
      const overlaps = pageOverlapsSince(before, sinceMs);
      hiddenChanges += changes.filter((item) => sinceVerdict(item, sinceMs, overlaps) === "keep").length;
    }
    unknown += res.unknown ?? 0;
    if (received.length === 0) return { items, truncated: false, hiddenChanges, unknown };

    let reachedSince = false;
    if (opts.sinceMs != null) {
      const sinceMs = opts.sinceMs;
      const overlaps = pageOverlapsSince(before, sinceMs);
      let olderItem = false;
      for (const item of received) {
        const verdict = sinceVerdict(item, sinceMs, overlaps);
        if (verdict === "keep") items.push(item);
        else if (verdict === "older") olderItem = true;
      }
      // 커서를 읽지 못하면 원소 시각으로 대신 판단한다.
      reachedSince = cursorMs != null ? cursorMs < sinceMs - SINCE_STOP_MARGIN_MS : olderItem;
    } else {
      items.push(...received);
    }

    // 커서가 없거나 그대로면 더 받을 방법이 없다.
    if (!paging || reachedSince || !cursor || cursor === before) {
      return { items, nextCursor: cursor, truncated: false, hiddenChanges, unknown };
    }
    before = cursor;
  }
  return { items, nextCursor: before, truncated: true, hiddenChanges, unknown };
}
