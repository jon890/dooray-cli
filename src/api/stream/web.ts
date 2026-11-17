/**
 * 스트림 웹 경로(`/v2/wapi/streams`)의 카드를 공식 활동 원소(`{type, <type>: {…}}`)로 바꾼다.
 * 웹 카드는 종류와 id 만 담고 내용은 references 의 맵에 있다. 경로와 변환 근거는 docs/api/web-endpoints/stream.md 가 소유한다.
 * 공개 API 원소 종류에 없는 변경 기록(시스템 기록, 위키 활동, 일정 삭제 알림, 프로젝트 카드)의 모양은 ADR-083 이 정한다.
 */
import type { StreamClient } from "./types.js";
import type { StreamItem } from "./types.js";
import { date, identifier, invalidResponse, pick, row, rows, text, type Row } from "../web/convert.js";
import type { WebContext } from "../web/context.js";

/** 웹 화면의 스트림 패널이 보내는 서비스 목록 그대로다. 비우면 빈 목록이 온다. */
const SERVICES = "project,mail,calendar,drive,wiki,contacts,ai";

function map(references: Row, name: string): Row {
  const value = references[name];
  return value === undefined || value === null ? {} : row(value);
}

function entry(maps: Row, id: string): Row {
  const found = maps[id];
  if (found === undefined) return invalidResponse();
  return row(found);
}

function body(value: unknown): { mimeType: string; content: string } {
  const source = row(value);
  return { mimeType: text(source.mimeType), content: typeof source.content === "string" ? source.content : "" };
}

function who(value: unknown): Row {
  const source = row(value);
  return { organizationMemberId: identifier(source.organizationMemberId), ...pick(source, ["name"]) };
}

function postUser(value: unknown): Row {
  const source = row(value);
  const type = text(source.type);
  if (type === "group") return { type, group: { projectMemberGroupId: identifier(row(source.group).projectMemberGroupId) } };
  if (type === "emailUser") return { type, emailUser: pick(row(source.emailUser), ["name", "emailAddress"]) };
  return { type, member: who(source.member) };
}

function users(value: unknown): Row {
  const source = row(value ?? {});
  return {
    ...(source.from ? { from: postUser(source.from) } : {}),
    to: Array.isArray(source.to) ? source.to.map(postUser) : [],
    cc: Array.isArray(source.cc) ? source.cc.map(postUser) : [],
  };
}

function scheduleUser(value: unknown): Row {
  const source = row(value);
  const member = row(source.member);
  return { type: text(source.type), member: { organizationMemberId: identifier(member.organizationMemberId), ...pick(member, ["name", "emailAddress", "status"]) } };
}

function scheduleUsers(value: unknown): Row {
  const source = row(value ?? {});
  return {
    ...(source.from ? { from: scheduleUser(source.from) } : {}),
    to: Array.isArray(source.to) ? source.to.map(scheduleUser) : [],
    cc: Array.isArray(source.cc) ? source.cc.map(scheduleUser) : [],
  };
}

function eventIds(card: Row): Row[] {
  return Array.isArray(card.eventList) ? rows(card.eventList) : [];
}

function isRow(value: unknown): value is Row {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** 시각 문자열이면 공식 모양으로 바꾸고, 없거나 읽을 수 없으면 `undefined` 다. 변경 기록과 댓글 시각에 새 실패 경로를 만들지 않는다. */
function optionalTime(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    return date(value) ?? undefined;
  } catch {
    return undefined;
  }
}

/** 본문 글(`body.mimeType`)이 있으면 공개 API 댓글 모양으로 낼 수 있다. 없으면 시스템 기록이다. */
function hasBodyText(ev: Row): boolean {
  return isRow(ev.body) && typeof ev.body.mimeType === "string";
}

function creator(ev: Row): Row {
  return { type: text(row(ev.creator).type), member: who(row(ev.creator).member) };
}

/** 업무·일정의 시스템 기록을 공개 API `event` 모양에 `actions` 를 더하고 `body` 키를 뺀 원소로 바꾼다(ADR-083). 시각이 없으면 `undefined` 다. */
function systemEvent(sub: Row, id: string, ev: Row, owner: "postId" | "scheduleId"): StreamItem | undefined {
  const createdAt = optionalTime(ev.createdAt);
  if (createdAt === undefined) return undefined;
  const updatedAt = optionalTime(ev.modifiedAt);
  const actions = isRow(ev.body) && Array.isArray(ev.body.actions) ? ev.body.actions : [];
  return { type: "event", event: {
    read: sub.read === true, id, type: text(ev.type), [owner]: identifier(ev[owner]), creator: creator(ev),
    createdAt, ...(updatedAt !== undefined && { updatedAt }), actions,
  } };
}

export interface ConvertedStream { items: StreamItem[]; changes: StreamItem[]; unknown: number; memberNames: Map<string, string> }

/**
 * 카드 목록을 원소로 바꾼다. 공개 API 원소 종류에 없는 변경 기록은 `withChanges` 면 `items` 에 카드 순서대로, 아니면 `changes` 에 둔다(ADR-083).
 * 모르는 카드 종류, 맵에 없는 하위 항목, 모양이 맞지 않은 변경 기록은 `unknown` 으로 센다.
 * 참조 맵에 없는 카드와 공개 API 종류 원소의 모양 오류는 구조가 바뀐 것이라 멈춘다.
 */
export function convertStreamCards(cards: Row[], references: Row, withChanges: boolean): ConvertedStream {
  const items: StreamItem[] = [];
  const changes: StreamItem[] = [];
  let unknown = 0;
  const mails = map(references, "mailMap"), posts = map(references, "postMap"), events = map(references, "eventMap");
  const pages = map(references, "pageMap"), pageComments = map(references, "pageCommentMap"), schedules = map(references, "scheduleMap");
  const pageEvents = map(references, "pageEventMap");
  // 변경 기록 하나만 감싼다. 웹 모양이 바뀌어도 옵션 없는 호출이 실패하지 않게 그 항목만 센다.
  const change = (build: () => StreamItem | undefined) => {
    let item: StreamItem | undefined;
    try {
      item = build();
    } catch {
      item = undefined;
    }
    if (item === undefined) unknown += 1;
    else (withChanges ? items : changes).push(item);
  };
  for (const card of cards) {
    const type = text(card.type);
    if (type === "mail") {
      const id = identifier(row(card.mail).id), mail = entry(mails, id), inner = row(mail.mail ?? {});
      items.push({ type, mail: {
        id, folder: { id: identifier(mail.folderId), name: text(mail.folderName) },
        sentAt: date(inner.sentAt ?? mail.createdAt), subject: text(mail.subject),
        users: { from: { type: text(row(row(mail.users).from).type), emailUser: pick(row(row(row(mail.users).from).emailUser), ["name", "emailAddress"]) } },
        body: body(mail.body),
      } });
    } else if (type === "post") {
      const ref = row(card.post), id = identifier(ref.id), post = entry(posts, id);
      items.push({ type, post: {
        read: ref.read === true, id, projectId: identifier(post.projectId), users: users(post.users),
        subject: text(post.subject), body: body(post.body), createdAt: date(post.createdAt), updatedAt: date(post.updatedAt),
      } });
      for (const sub of eventIds(card)) {
        const eventId = identifier(sub.id), ev = events[eventId];
        if (!isRow(ev)) { unknown += 1; continue; }
        if (!hasBodyText(ev)) { change(() => systemEvent(sub, eventId, ev, "postId")); continue; }
        const createdAt = optionalTime(ev.createdAt), updatedAt = optionalTime(ev.modifiedAt);
        items.push({ type: "event", event: {
          read: sub.read === true, id: eventId, type: text(ev.type), postId: identifier(ev.postId), creator: creator(ev), body: body(ev.body),
          ...(createdAt !== undefined && { createdAt }), ...(updatedAt !== undefined && { updatedAt }),
        } });
      }
    } else if (type === "page") {
      const ref = row(card.page), id = identifier(ref.id), page = entry(pages, id), create = row(page.create);
      items.push({ type, page: {
        read: ref.read === true, id, wikiId: identifier(page.wikiId),
        ...(page.parentPageId ? { parentPageId: identifier(page.parentPageId) } : {}),
        subject: text(page.subject),
        referrers: (Array.isArray(page.referrers) ? rows(page.referrers) : []).map((r) => ({ organizationMemberId: identifier(r.organizationMemberId) })),
        body: body(page.body), creator: who(create.member), createdAt: date(create.dateTime),
      } });
      for (const sub of eventIds(card)) {
        const subId = identifier(sub.id);
        if (subId in pageComments) {
          const comment = row(pageComments[subId]);
          items.push({ type: "pageComment", pageComment: {
            read: sub.read === true, id: identifier(comment.pageCommentId ?? subId), pageId: identifier(comment.pageId),
            body: body(comment.body), creator: who(comment.creator), createdAt: date(comment.createdAt),
          } });
        } else if (subId in pageEvents) {
          change(() => {
            const pageEvent = row(pageEvents[subId]);
            return optionalTime(pageEvent.createdAt) === undefined ? undefined : { type: "pageEvent", pageEvent };
          });
        } else unknown += 1;
      }
    } else if (type === "schedule") {
      const ref = row(card.schedule), id = identifier(ref.id), schedule = entry(schedules, id);
      const rule = schedule.recurrenceRule && typeof schedule.recurrenceRule === "object" ? pick(row(schedule.recurrenceRule), ["frequency", "interval", "until", "byday", "bymonth", "bymonthday"]) : undefined;
      items.push({ type, schedule: {
        read: ref.read === true, id, calendarId: identifier(schedule.calendarId), users: scheduleUsers(schedule.users),
        startedAt: date(schedule.startedAt), endedAt: date(schedule.endedAt), wholeDayFlag: schedule.wholeDayFlag === true,
        subject: text(schedule.subject), recurrenceType: text(schedule.recurrenceType), ...(rule && Object.keys(rule).length ? { recurrenceRule: rule } : {}),
      } });
      for (const sub of eventIds(card)) {
        const eventId = identifier(sub.id), ev = events[eventId];
        // 본문 글이 있는 일정 하위 항목은 담을 모양을 정하지 않아 모르는 항목으로 센다.
        if (!isRow(ev) || hasBodyText(ev)) { unknown += 1; continue; }
        change(() => systemEvent(sub, eventId, ev, "scheduleId"));
      }
    } else if (type === "calendar") change(() => ({ type, calendar: row(card.calendar) }));
    else if (type === "project") change(() => ({ type, project: row(card.project) }));
    else unknown += 1;
  }
  return { items, changes, unknown, memberNames: memberNames(references) };
}

/** 표에 보일 이름은 원소에 더하지 않고 멤버 이름 캐시로만 내준다(ADR-083). 모양이 맞지 않는 항목은 건너뛴다. */
function memberNames(references: Row): Map<string, string> {
  const names = new Map<string, string>();
  const source = references.organizationMemberMap;
  if (!isRow(source)) return names;
  for (const value of Object.values(source)) {
    if (isRow(value) && typeof value.id === "string" && typeof value.name === "string") names.set(value.id, value.name);
  }
  return names;
}

export function createStreamWeb(context: WebContext): StreamClient {
  return {
    async getStreams(params) {
      let before = params?.before;
      const withChanges = params?.withChanges === true;
      const seen = new Set<string>();
      const changes: StreamItem[] = [];
      let unknown = 0;
      // 한 페이지가 전부 빠져 비면, 호출자가 끝으로 오해하지 않게 다음 페이지를 이어 받는다. 이어 받는 동안 뺀 변경 기록과 건수는 모은다.
      for (;;) {
        const response = await context.http.request("v2/wapi/streams", {
          searchParams: { services: SERVICES, size: params?.size, before, read: params?.read },
        });
        const result = row(response.result), references = row(result.references ?? {});
        const cards = rows(result.contents);
        const converted = convertStreamCards(cards, references, withChanges);
        const items = converted.items;
        changes.push(...converted.changes);
        unknown += converted.unknown;
        for (const [id, name] of converted.memberNames) context.memberNames.set(id, name);
        const next = references.nextTimestamp;
        const cursor = typeof next === "string" && next !== "" ? next : typeof next === "number" ? String(next) : undefined;
        // 원본 카드가 있었으면 걸러져 비어도 끝이 아니다. 끝은 원본이 빈 페이지다. 커서가 되풀이되면 멈춘다.
        if (items.length === 0 && cards.length > 0 && cursor !== undefined && cursor !== before && !seen.has(cursor)) { seen.add(cursor); before = cursor; continue; }
        return { header: response.header, result: items, ...(cursor !== undefined && { cursor }), changes, unknown };
      }
    },
  };
}
