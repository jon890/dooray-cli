/**
 * 메신저 대화방 목록의 규칙. `messenger channels` 가 쓴다.
 *
 * 필터·정렬과 표시명, `--search` 매칭, 기본 제외 안내를 맡는다. 명령 파일은 옵션을 읽고 출력만 한다.
 * API 가 파라미터를 무시하고 전체를 주므로 필터·정렬은 모두 클라이언트에서 한다 (ADR-066).
 * 제목이 빈 방(1:1 방 전부와 일부 그룹방)은 참여자 이름으로 표시명을 만든다.
 * 정렬과 `--since` 는 `updatedAt` 을 쓴다. 공식 문서가 갱신 조건을 정하지 않아 「수정 시각」 으로만 부른다.
 */

import type { MemberClient } from "@/api/member/types.js";
import type { MessengerChannel } from "@/api/messenger/types.js";
import { buildOrganizationMemberNameMap } from "../../resolvers/member.js";
import { ensureMe } from "../../resolvers/me.js";

// 표의 종류 열. 문서에 없는 값은 이 표에 없어 원문을 그대로 보인다.
const CHANNEL_KIND_LABELS = new Map<string, string>([
  ["direct", "DM"],
  ["private", "그룹"],
  ["me", "나와의 대화"],
  ["bot", "봇"],
]);

// 제목 없는 방 표시명에 이름을 몇 명까지 늘어놓을지. 표 모드는 이 수만큼만 이름을 조회한다.
const MAX_NAMES_IN_LABEL = 3;

/**
 * 보관된 방, 숨긴 방(`displayed: false`), `status` 가 `normal` 이 아닌 방(`system`·`archived`·`deleted`)을
 * 기본 목록에서 뺀다. `status`·`displayed` 키가 없는 방은 남긴다.
 */
function isActive(ch: MessengerChannel): boolean {
  return (
    !ch.archivedAt &&
    ch.displayed !== false &&
    (ch.status == null || ch.status === "normal")
  );
}

/** 기본 목록에서 빠진 이유별 방 수. 보관(`archivedAt`·`archived`) → 숨김 → 그 밖의 `status` 순으로 한 방을 한 번만 센다. */
export interface ExcludedCounts {
  archived: number;
  hidden: number;
  otherStatus: number;
}

/**
 * 기본 제외로 빠진 방을 이유별로 센다. `--type`·`--since` 로 어차피 빠질 방은 세지 않는다.
 * 사용자가 거른 조건에서 `--all` 만 더하면 나오는 방 수여야 알림이 맞다.
 */
export function countExcludedByDefault(
  channels: MessengerChannel[],
  opts: { type?: string; sinceMs?: number },
): ExcludedCounts {
  const counts: ExcludedCounts = { archived: 0, hidden: 0, otherStatus: 0 };
  for (const ch of channels) {
    if (isActive(ch)) continue;
    if (opts.type != null && ch.type !== opts.type) continue;
    if (opts.sinceMs != null && updatedAtMs(ch) < opts.sinceMs) continue;
    if (ch.archivedAt || ch.status === "archived") counts.archived++;
    else if (ch.displayed === false) counts.hidden++;
    else counts.otherStatus++;
  }
  return counts;
}

/** 제외된 방이 있으면 stderr 로 한 줄 알릴 문구. 없으면 null. stdout 은 건드리지 않는다. */
export function formatExcludedNotice(counts: ExcludedCounts, resultCount: number): string | null {
  const parts: string[] = [];
  if (counts.hidden > 0) parts.push(`숨긴 방 ${counts.hidden}개`);
  if (counts.archived > 0) parts.push(`보관된 방 ${counts.archived}개`);
  if (counts.otherStatus > 0) parts.push(`시스템·삭제 등 status 가 normal 이 아닌 방 ${counts.otherStatus}개`);
  if (parts.length === 0) return null;
  const tail = resultCount === 0 ? " 찾는 방이 이 안에 있을 수 있다." : "";
  return `ℹ  ${parts.join(", ")}를 뺐다. --all 로 모두 본다.${tail}\n`;
}

function updatedAtMs(ch: MessengerChannel): number {
  const ms = ch.updatedAt ? Date.parse(ch.updatedAt) : NaN;
  return Number.isNaN(ms) ? -Infinity : ms;
}

/** 필터를 적용하고 수정 시각(updatedAt) 최신순으로 정렬한다. 이름이 필요 없는 조건만 다룬다(`--search` 는 따로). */
export function filterAndSortChannels(
  channels: MessengerChannel[],
  opts: { type?: string; sinceMs?: number; all?: boolean },
): MessengerChannel[] {
  return channels
    .filter((ch) => opts.all || isActive(ch))
    .filter((ch) => opts.type == null || ch.type === opts.type)
    // updatedAt 이 없거나 읽을 수 없는 방은 --since 를 만족한다고 볼 수 없어 뺀다.
    .filter((ch) => opts.sinceMs == null || updatedAtMs(ch) >= opts.sinceMs)
    .sort((a, b) => updatedAtMs(b) - updatedAtMs(a));
}

function participantIds(ch: MessengerChannel): string[] {
  return (ch.users?.participants ?? [])
    .map((p) => p.member?.organizationMemberId)
    .filter((id): id is string => !!id);
}

function otherParticipantIds(ch: MessengerChannel, myId: string | undefined): string[] {
  return participantIds(ch).filter((id) => id !== myId);
}

/**
 * 제목이 빈 방의 표시명. 나를 뺀 참여자 이름으로 `DM: 홍길동` / `그룹: 가, 나, 다 외 N명` / `봇: 가 외 N명`.
 * `me`(나와의 대화) 방은 참여자와 상관없이 `나와의 대화` 다. 문서에 없는 type 은 그룹 규칙에 원문 type 을 접두로 쓴다.
 * 이름을 하나도 얻지 못하면 대체 문구를 쓴다. 나만 있는 방은 `(나)` 로 표시한다.
 * 화면 표시용이다. `--search` 는 이 문자열이 아니라 참여자 이름 각각에서 찾는다.
 */
export function buildUntitledLabel(
  ch: MessengerChannel,
  myId: string | undefined,
  nameMap: Map<string, string>,
): string {
  if (ch.type === "me") return "나와의 대화";
  // 문서에 없는 type 은 channelKind 가 원문을 돌려준다.
  const prefix = channelKind(ch.type);
  const withPrefix = (body: string) => (prefix ? `${prefix}: ${body}` : body);
  const ids = participantIds(ch);
  const others = ids.filter((id) => id !== myId);
  if (ids.length > 0 && others.length === 0) return withPrefix("(나)");

  const names = others
    .slice(0, MAX_NAMES_IN_LABEL)
    .map((id) => nameMap.get(id))
    .filter((n): n is string => !!n);
  if (names.length === 0) {
    return withPrefix(ch.type === "direct" ? "(상대 미확인)" : "(참여자 미확인)");
  }
  // 이름을 얻지 못한 참여자도 "외 N명" 에 센다.
  const rest = others.length - names.length;
  return withPrefix(`${names.join(", ")}${rest > 0 ? ` 외 ${rest}명` : ""}`);
}

/** 제목이 있으면 제목, 없으면 나를 뺀 참여자의 실제 이름 각각에서 찾는다. */
function matchesSearch(
  ch: MessengerChannel,
  others: string[],
  nameMap: Map<string, string>,
  keyword: string,
): boolean {
  if (ch.title) return ch.title.toLowerCase().includes(keyword);
  return others.some((id) => nameMap.get(id)?.toLowerCase().includes(keyword) ?? false);
}

// 응답에 type 이 없을 수 있어 빈 문자열로 받는다.
export function channelKind(type: string | undefined): string {
  if (type == null) return "";
  return CHANNEL_KIND_LABELS.get(type) ?? type;
}

/**
 * 목록 응답의 me 가 빠진 방에 쓸 내 id. 그런 방이 없으면 조회하지 않는다.
 * 조회에 실패해도 목록은 살린다 — 그 방들은 나를 빼지 않은 채로 보인다.
 */
async function fallbackMyId(
  client: MemberClient,
  untitled: MessengerChannel[],
): Promise<string | undefined> {
  if (!untitled.some((ch) => !ch.me?.member?.organizationMemberId)) return undefined;
  try {
    return (await ensureMe(client)).id;
  } catch {
    process.stderr.write(
      "⚠  내 정보를 확인하지 못해 일부 대화방의 참여자 목록에서 나를 빼지 못했습니다.\n",
    );
    return undefined;
  }
}

// id 가 없는 방은 --quiet 의 id 줄에서 뺀다.
export function channelIds(channels: MessengerChannel[]): string[] {
  return channels.map((ch) => ch.id).filter((id): id is string => !!id);
}


export interface NamedChannels {
  /** `--search` 를 적용한 방 목록. */
  channels: MessengerChannel[];
  /** 표에 쓸 표시명. 표 모드가 아니면 비어 있다. */
  labels: Map<MessengerChannel, string>;
}

/**
 * 표시명과 `--search` 에 필요한 참여자 이름을 조회해 표시명을 만들고 검색어로 방을 거른다.
 * 이름 조회는 방마다 호출이 붙으므로 표 모드나 검색어가 있을 때만 부르고, 필요한 참여자만 조회한다.
 * 검색어가 있으면 모든 참여자가 대상이고, 표만 그릴 때는 화면에 나올 앞 몇 명이면 된다.
 */
export async function nameAndSearchChannels(
  client: MemberClient,
  channels: MessengerChannel[],
  opts: { keyword?: string; tableMode: boolean },
): Promise<NamedChannels> {
  const { keyword, tableMode } = opts;
  const labels = new Map<MessengerChannel, string>();
  if (keyword == null && !tableMode) return { channels, labels };

  const untitled = channels.filter((ch) => !ch.title);
  const othersByChannel = new Map<MessengerChannel, string[]>();
  const myFallback = await fallbackMyId(client, untitled);
  for (const ch of untitled) {
    othersByChannel.set(ch, otherParticipantIds(ch, ch.me?.member?.organizationMemberId ?? myFallback));
  }
  // 나는 조회하지 않는다.
  const lookupIds = untitled.flatMap((ch) => {
    const others = othersByChannel.get(ch)!;
    return keyword != null ? others : others.slice(0, MAX_NAMES_IN_LABEL);
  });
  const nameMap = await buildOrganizationMemberNameMap(client, lookupIds);

  if (tableMode) {
    for (const ch of channels) {
      const myId = ch.me?.member?.organizationMemberId ?? myFallback;
      labels.set(ch, ch.title || buildUntitledLabel(ch, myId, nameMap));
    }
  }

  let found = channels;
  if (keyword != null) {
    found = channels.filter((ch) => matchesSearch(ch, othersByChannel.get(ch) ?? [], nameMap, keyword));
    // 이름을 못 얻은 참여자로는 찾을 수 없다. 조용히 빠지면 "그 사람과의 방이 없다" 로 읽히므로 알린다.
    const unresolved = new Set(
      untitled.flatMap((ch) => othersByChannel.get(ch)!).filter((id) => !nameMap.has(id)),
    );
    if (unresolved.size > 0) {
      process.stderr.write(
        `⚠  참여자 ${unresolved.size}명의 이름을 확인하지 못해 그 이름으로는 찾지 못했습니다.\n`,
      );
    }
  }
  return { channels: found, labels };
}
