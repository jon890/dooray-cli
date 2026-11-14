/**
 * 스트림 웹 경로(`/v2/wapi/streams`)의 카드를 공식 활동 원소(`{type, <type>: {…}}`)로 바꾼다.
 * 웹 카드는 종류와 id 만 담고 내용은 references 의 맵에 있다. 경로와 변환 근거는 docs/api/web-endpoints/stream.md 가 소유한다.
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

export interface ConvertedStream { items: StreamItem[]; dropped: number }

/** 카드 목록을 공식 원소로 바꾼다. 공식 종류에 없는 카드와 하위 항목은 개수만 센다. 참조 맵에 없는 카드는 구조가 바뀐 것이라 멈춘다. */
export function convertStreamCards(cards: Row[], references: Row): ConvertedStream {
  const items: StreamItem[] = [];
  let dropped = 0;
  const mails = map(references, "mailMap"), posts = map(references, "postMap"), events = map(references, "eventMap");
  const pages = map(references, "pageMap"), pageComments = map(references, "pageCommentMap"), schedules = map(references, "scheduleMap");
  const pageEvents = map(references, "pageEventMap");
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
        const eventId = identifier(sub.id), ev = entry(events, eventId);
        // 본문이 없는 이벤트(상태 변경 같은 시스템 활동)는 공식 event 모양에 담을 수 없어 뺀다.
        if (!ev.body || typeof row(ev.body).mimeType !== "string") { dropped += 1; continue; }
        items.push({ type: "event", event: {
          read: sub.read === true, id: eventId, type: text(ev.type), postId: identifier(ev.postId),
          creator: { type: text(row(ev.creator).type), member: who(row(ev.creator).member) }, body: body(ev.body),
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
        } else if (subId in pageEvents) dropped += 1;
        else return invalidResponse();
      }
    } else if (type === "schedule") {
      const ref = row(card.schedule), id = identifier(ref.id), schedule = entry(schedules, id);
      const rule = schedule.recurrenceRule && typeof schedule.recurrenceRule === "object" ? pick(row(schedule.recurrenceRule), ["frequency", "interval", "until", "byday", "bymonth", "bymonthday"]) : undefined;
      items.push({ type, schedule: {
        read: ref.read === true, id, calendarId: identifier(schedule.calendarId), users: scheduleUsers(schedule.users),
        startedAt: date(schedule.startedAt), endedAt: date(schedule.endedAt), wholeDayFlag: schedule.wholeDayFlag === true,
        subject: text(schedule.subject), recurrenceType: text(schedule.recurrenceType), ...(rule && Object.keys(rule).length ? { recurrenceRule: rule } : {}),
      } });
      dropped += eventIds(card).length;
    } else dropped += 1;
  }
  return { items, dropped };
}

export function createStreamWeb(context: WebContext): StreamClient {
  let warned = false;
  return {
    async getStreams(params) {
      let before = params?.before;
      const seen = new Set<string>();
      // 한 페이지가 전부 공식 종류 밖이라 비면, 호출자가 끝으로 오해하지 않게 다음 페이지를 이어 받는다.
      for (;;) {
        const response = await context.http.request("v2/wapi/streams", {
          searchParams: { services: SERVICES, size: params?.size, before, read: params?.read },
        });
        const result = row(response.result), references = row(result.references ?? {});
        const cards = rows(result.contents);
        const { items, dropped } = convertStreamCards(cards, references);
        if (dropped > 0 && !warned) {
          warned = true;
          process.stderr.write("ℹ  웹 응답에는 공식 활동 종류에 없는 항목(캘린더 공유 알림, 위키 활동 등)이 있어 뺐습니다.\n");
        }
        const next = references.nextTimestamp;
        const cursor = typeof next === "string" && next !== "" ? next : typeof next === "number" ? String(next) : undefined;
        // 원본 카드가 있었으면 걸러져 비어도 끝이 아니다. 끝은 원본이 빈 페이지다. 커서가 되풀이되면 멈춘다.
        if (items.length === 0 && cards.length > 0 && cursor !== undefined && cursor !== before && !seen.has(cursor)) { seen.add(cursor); before = cursor; continue; }
        return { header: response.header, result: items, ...(cursor !== undefined && { cursor }) };
      }
    },
  };
}
