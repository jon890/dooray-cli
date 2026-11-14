/**
 * 캘린더 웹 경로를 호출하고 공식 응답 모양으로 바꾼다. 경로와 쿼리는 docs/api/web-endpoints/calendar.md 가 소유한다.
 * 웹 `/v2/wapi` 는 Dooray-Api-Version 헤더에 따라 모양이 달라져 호출마다 화면과 같은 1.2 를 붙인다.
 */
import type { CalendarClient } from "./types.js";
import type {
  Calendar,
  CalendarEvent,
  CalendarEventDetail,
  CalendarEventUser,
  CalendarEventWriteRequest,
} from "../types.js";
import { apiPath } from "../api-path.js";
import { date, identifier, invalidResponse, pick, referenceMap, row, rows, text, type Row } from "../web/convert.js";
import type { WebContext } from "../web/context.js";
import { DoorayCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";

const HEADERS = { "Dooray-Api-Version": "1.2" };
const UNSUPPORTED = "웹 방식에서는 지원하지 않습니다. auth-mode 를 api-key 로 바꾸세요.";
const unsupported = (): never => { throw new DoorayCliError(UNSUPPORTED, EXIT_PARAM_ERROR); };

function nested(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Row) : {};
}

function calendar(source: Row): Calendar {
  const out: Row = { id: identifier(source.id), ...pick(source, ["name", "type", "ownerOrganizationMemberId", "projectId"]) };
  if (source.createdAt !== undefined && source.createdAt !== null) out.createdAt = date(source.createdAt);
  const me = nested(source.me);
  if (Object.keys(me).length) out.me = pick(me, ["default", "color", "listed", "checked", "role", "order"]);
  return out as unknown as Calendar;
}

function user(source: unknown): CalendarEventUser {
  const value = row(source);
  const type = text(value.type);
  const status = typeof value.status === "string" ? { status: value.status } : {};
  if (type === "emailUser") {
    const email = row(value.emailUser);
    return { type, ...status, emailUser: { emailAddress: text(email.emailAddress), name: typeof email.name === "string" ? email.name : "" } };
  }
  const member = row(value.member);
  const memberStatus = typeof member.status === "string" ? { status: member.status } : status;
  return { type, ...memberStatus, member: { organizationMemberId: identifier(member.organizationMemberId), ...pick(member, ["name", "emailAddress"]) } };
}

/** 웹 `users.me` 를 공식 `me`(type, member, status, userType)로 옮긴다. 참여자가 아니면 status·userType 이 없다. */
function me(users: Row): CalendarEvent["me"] | undefined {
  if (!users.me) return undefined;
  const source = row(users.me);
  const member = row(source.member);
  return {
    type: text(source.type),
    member: { organizationMemberId: identifier(member.organizationMemberId), ...pick(member, ["name", "emailAddress"]) },
    ...pick(member, ["status", "userType"]),
  } as CalendarEvent["me"];
}

function event(source: Row, references: unknown): CalendarEvent {
  const calendarId = identifier(source.calendarId);
  const calendars = referenceMap(references, "calendarMap");
  const calendarRef = nested(calendars[calendarId]);
  const out: Row = {
    id: identifier(source.id),
    ...pick(source, ["masterScheduleId", "location", "subject", "category", "wholeDayFlag", "uid", "recurrenceType", "conferencing"]),
    calendar: { id: calendarId, ...pick(calendarRef, ["name"]) },
    recurrenceId: typeof source.recurrenceId === "string" && source.recurrenceId !== "" ? source.recurrenceId : null,
    startedAt: date(source.startedAt),
    endedAt: date(source.endedAt),
    createdAt: date(source.createdAt),
    updatedAt: date(source.updatedAt),
  };
  if (source.tenantId !== undefined && source.tenantId !== null) out.tenant = { id: identifier(source.tenantId) };
  return out as unknown as CalendarEvent;
}

function recurrenceRule(value: unknown): Row {
  const { startedAt: _start, endedAt: _end, ...rest } = row(value);
  return rest;
}

/** 공식 쓰기 본문을 웹 일정 본문으로 바꾼다. 참석자는 웹에서 실측하지 못해 받지 않는다. */
function webBody(body: CalendarEventWriteRequest, mode: "create" | "update"): Row {
  if (body.users?.to?.length || body.users?.cc?.length) return unsupported();
  const out: Row = {};
  if (body.subject !== undefined) out.subject = body.subject;
  if (body.body !== undefined) out.body = body.body;
  if (body.location !== undefined) out.location = body.location;
  if (body.startedAt !== undefined) out.startedAt = body.startedAt;
  if (body.endedAt !== undefined) out.endedAt = body.endedAt;
  if (body.wholeDayFlag !== undefined) out.wholeDayFlag = body.wholeDayFlag;
  const settings = body.personalSettings;
  if (settings) {
    out.personalSettings = {
      ...(settings.alarms !== undefined && { alarms: settings.alarms.map((alarm) => ({ ...alarm, option: null })) }),
      ...(settings.busy !== undefined && { busy: settings.busy }),
      ...(settings.class !== undefined && { class: settings.class }),
    };
  }
  if (mode === "create") {
    out.body ??= { mimeType: "text/x-markdown", content: "" };
    out.subject ??= "";
    out.location ??= "";
    out.wholeDayFlag ??= false;
    const base = nested(out.personalSettings);
    out.personalSettings = { alarms: [], busy: true, class: "public", ...base, travelTime: null };
    Object.assign(out, { resourceId: null, category: "general", users: { to: [], cc: [] }, replyFlag: false, fileIdList: [], conferencing: null });
  }
  return out;
}

export function createCalendarWeb(context: WebContext): CalendarClient {
  const http = context.http;
  const rule = (body: CalendarEventWriteRequest, start: unknown, end: unknown): Row => ({
    recurrenceType: "unmodified",
    recurrenceRule: {
      frequency: body.recurrenceRule!.frequency,
      interval: body.recurrenceRule!.interval ?? 1,
      startedAt: start, endedAt: end,
      until: body.recurrenceRule!.until ?? null,
      byday: body.recurrenceRule!.byday ?? "",
      bymonthday: body.recurrenceRule!.bymonthday ?? "",
      bymonth: body.recurrenceRule!.bymonth ?? "",
      timezoneName: body.recurrenceRule!.timezoneName,
    },
  });
  // event edit 가 수정 전에 읽은 상세를 반복 규칙의 시각에 다시 쓴다. 같은 일정을 두 번 읽지 않는다.
  let lastDetail: { key: string; detail: CalendarEventDetail } | undefined;
  const client: CalendarClient = {
    async getCalendars() {
      const response = await http.request("v2/wapi/calendars", { searchParams: { size: 99999 }, headers: HEADERS });
      const result = rows(row(response.result).contents).filter((source) => source.type !== "subscription").map(calendar);
      return { header: response.header, result, totalCount: result.length };
    },
    async getCalendarEvents(timeMin, timeMax) {
      const response = await http.request("v2/wapi/calendars/*/schedules", { searchParams: { timeMin, timeMax }, headers: HEADERS });
      const result = row(response.result);
      const items = rows(result.contents).map((source) => {
        const item = event(source, result.references);
        const mine = me(nested(source.users));
        return { ...item, users: {}, ...(mine && { me: mine }) };
      });
      return { header: response.header, result: items };
    },
    async getCalendarEvent(calendarId, eventId) {
      const response = await http.request(apiPath`v2/wapi/calendars/${calendarId}/schedules/${eventId}`, { headers: HEADERS });
      const envelope = row(response.result);
      const source = row(envelope.content);
      const users = nested(source.users);
      const body = nested(source.body);
      const detail: Row = {
        ...event(source, envelope.references),
        users: {
          ...(users.from ? { from: user(users.from) } : {}),
          to: Array.isArray(users.to) ? users.to.map(user) : [],
          cc: Array.isArray(users.cc) ? users.cc.map(user) : [],
        },
      };
      const mine = me(users);
      if (mine) detail.me = mine;
      if (typeof body.content === "string") detail.body = { mimeType: text(body.mimeType), content: body.content };
      if (source.recurrenceRule) detail.recurrenceRule = recurrenceRule(source.recurrenceRule);
      lastDetail = { key: `${calendarId}/${eventId}`, detail: detail as unknown as CalendarEventDetail };
      return { header: response.header, result: detail as unknown as CalendarEventDetail };
    },
    async createCalendarEvent(calendarId, body) {
      const item = { calendarId, ...webBody(body, "create"), recurrenceType: "none", recurrenceRule: null } as Row;
      if (body.recurrenceRule) Object.assign(item, rule(body, item.startedAt, item.endedAt));
      const response = await http.request("v2/wapi/schedules", { method: "POST", json: [item], headers: HEADERS });
      const created = rows(response.result)[0];
      if (!created) return invalidResponse();
      return { header: response.header, result: { id: identifier(created.id) } };
    },
    async updateCalendarEvent(calendarId, eventId, body) {
      const payload = webBody(body, "update");
      if (body.recurrenceRule) {
        let start = body.startedAt, end = body.endedAt;
        if (start === undefined || end === undefined) {
          const existing = lastDetail?.key === `${calendarId}/${eventId}` ? lastDetail.detail : (await client.getCalendarEvent(calendarId, eventId)).result;
          start ??= existing.startedAt; end ??= existing.endedAt;
        }
        Object.assign(payload, rule(body, start, end));
      }
      const response = await http.request(apiPath`v2/wapi/calendars/${calendarId}/schedules/${eventId}`, { method: "PUT", json: payload, headers: HEADERS });
      return { header: response.header, result: null };
    },
    async deleteCalendarEvent(calendarId, eventId, deleteType) {
      const response = await http.request(apiPath`v2/wapi/calendars/${calendarId}/schedules/${eventId}`, { method: "DELETE", searchParams: { deleteType }, headers: HEADERS });
      return { header: response.header, result: null };
    },
    fetchBusyHours: async () => unsupported(),
  };
  return client;
}
