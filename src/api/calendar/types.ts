/** calendar 영역의 DTO·요청 파라미터와 클라이언트 계약이다. */
import type { DoorayApiResponse } from "@/api/common/types.js";

// ─── Calendar ───────────────────────────────────────────

/** 캘린더에 대한 내 설정과 권한. */
export interface CalendarMe {
  default?: boolean;
  color?: string;
  listed?: boolean;
  checked?: boolean;
  /** 실측 값: `owner`, `view`, `read_write`, `all` */
  role?: string;
  order?: number;
}

export interface Calendar {
  id: string;
  name?: string;
  type?: string;
  /** boolean 이 아니라 객체다. 객체는 항상 truthy 라 `if (cal.me)` 로 거르면 모든 캘린더가 통과한다. */
  me?: CalendarMe;
  ownerOrganizationMemberId?: string;
  /** project 캘린더에만 붙는다(공식 문서상 추후 제공). 다른 캘린더에는 null 로 온다(실측). */
  projectId?: string | null;
  createdAt?: string;
}

/** 실측은 숫자(`12`)로 오지만 공식 문서 예시는 문자열(`"2"`)이라 둘 다 받는다. */
export type CalendarListResponse = DoorayApiResponse<Calendar[]> & { totalCount?: number | string };

export interface CalendarEventMember {
  organizationMemberId?: string;
  name?: string;
  emailAddress?: string;
}

export interface CalendarEventUser {
  type?: string;
  status?: string;
  member?: CalendarEventMember;
  /** `type` 이 `emailUser` 인 조직 밖 참석자. */
  emailUser?: { emailAddress?: string; name?: string };
}

/**
 * 공식 문서는 목록 응답에 users 가 포함되지 않는다고 적지만, 실측으로는 빈 객체 `{}` 로 온다.
 * 채워진 값은 상세 조회에서만 얻는다.
 */
export interface CalendarEventUsers {
  from?: CalendarEventUser | null;
  to?: CalendarEventUser[] | null;
  cc?: CalendarEventUser[] | null;
}

/**
 * 그 일정에서의 나. 목록과 상세가 같은 구조다.
 *
 * `status` 와 `userType` 은 내가 그 일정의 참여자일 때만 온다. 공유받은 캘린더의 남의 일정은
 * `{ type, member: { organizationMemberId } }` 뿐이다(실측). 참여자면 `member` 에 이름과 이메일도 온다.
 */
export interface CalendarEventMe {
  type?: string;
  member?: CalendarEventMember;
  /** 실측 값: `accepted`, `declined`, `tentative`, `not_confirmed` */
  status?: string;
  /** 실측 값: `from`(등록자), `to`(참석자), `cc`(참조) */
  userType?: string;
}

export interface CalendarEventCalendar {
  id?: string;
  name?: string;
}

export interface CalendarEvent {
  id: string;
  subject?: string;
  startedAt?: string;
  endedAt?: string;
  wholeDayFlag?: boolean;
  calendar?: CalendarEventCalendar;
  category?: string;
  location?: string;
  users?: CalendarEventUsers;
  me?: CalendarEventMe;
  createdAt?: string;
  updatedAt?: string;
}

export interface CalendarEventBody {
  /** 실측 값: `text/x-markdown` */
  mimeType: string;
  content: string;
}

/**
 * 상세 응답의 반복 규칙. 쓰기 요청에 없는 `count`·`bysetpos`·`wkst` 같은 필드도 오고, 없는 값은 `null` 이다(실측).
 */
export interface CalendarEventRecurrenceRuleDetail {
  frequency?: string | null;
  interval?: number | null;
  until?: string | null;
  byday?: string | null;
  bymonth?: string | null;
  bymonthday?: string | null;
  [field: string]: unknown;
}

/** 상세는 목록 항목에 body 가 더해진 형태다. 반복 일정이면 recurrenceRule 도 온다. */
export interface CalendarEventDetail extends CalendarEvent {
  body?: CalendarEventBody;
  recurrenceRule?: CalendarEventRecurrenceRuleDetail | null;
}

// 목록 응답에 totalCount 는 없다.
export type CalendarEventListResponse = DoorayApiResponse<CalendarEvent[]>;

export type CalendarEventDetailResponse = DoorayApiResponse<CalendarEventDetail>;

// ─── Calendar 쓰기 요청 ─────────────────────────────────

/**
 * 일정 참석자·참조자. 사용자 입력으로는 조직 멤버(`member`)만 만든다. 외부 주소로 초대 메일이 나가는 사고를 막으려는 것이다.
 * `emailUser` 는 수정에서 기존 참석자를 그대로 옮겨 실을 때만 쓴다.
 */
export type CalendarEventWriteUser =
  | { type: "member"; member: { organizationMemberId: string } }
  | { type: "emailUser"; emailUser: { emailAddress: string; name: string } };

export interface CalendarEventAlarm {
  action: "mail" | "app";
  /** RFC 2445 trigger. 예: `TRIGGER:-PT10M` */
  trigger: string;
}

export interface CalendarEventRecurrenceRule {
  /** `daily`, `weekly`, `monthly`, `yearly` */
  frequency: string;
  interval?: number;
  until?: string;
  /** `TH`, `1 MO`, `-1 WE` 같은 값 */
  byday?: string;
  bymonth?: string;
  bymonthday?: string;
  timezoneName: string;
}

export interface CalendarEventPersonalSettings {
  alarms?: CalendarEventAlarm[];
  busy?: boolean;
  class?: "public" | "private";
}

/**
 * 생성(`POST`)과 수정(`PUT`)이 같은 본문을 쓴다. 수정은 빈 값이 아닌 필드만 반영한다(공식 문서).
 * 그래서 모든 필드를 선택으로 두고, 부르는 쪽이 사용자가 준 것만 담는다.
 */
export interface CalendarEventWriteRequest {
  users?: {
    to?: CalendarEventWriteUser[];
    cc?: CalendarEventWriteUser[];
  };
  subject?: string;
  body?: CalendarEventBody;
  startedAt?: string;
  endedAt?: string;
  wholeDayFlag?: boolean;
  location?: string;
  recurrenceRule?: CalendarEventRecurrenceRule;
  personalSettings?: CalendarEventPersonalSettings;
}

export type CreateCalendarEventResponse = DoorayApiResponse<{ id: string }>;

export type UpdateCalendarEventResponse = DoorayApiResponse<null>;

/** `this`: 그 일정만, `wholeFromThis`: 그 일정부터 이후 반복 전체, `whole`: 반복 전체 */
export type CalendarEventDeleteType = "this" | "wholeFromThis" | "whole";

export type DeleteCalendarEventResponse = DoorayApiResponse<null>;

// ─── Calendar > Busy Hours ──────────────────────────────

export interface BusyHoursRequest {
  organizationMemberIds: string[];
  beginDateTime: string;
  endDateTime: string;
}

/**
 * 소속 부서. 공식 문서는 부서가 없으면 `id` 와 `name` 이 각각 null 이라고 적는다.
 * 실측으로는 부서 이름이 있는데도 `id` 가 null 로 왔다. `id` 로 부서 유무를 판단하지 않는다.
 */
export interface BusyHoursDepartment {
  id: string | null;
  name: string | null;
}

/** `member get` 응답의 `defaultOrganization` 은 id 뿐이고, 이름은 이 응답에만 온다. */
export interface BusyHoursOrganization {
  id: string | null;
  name: string | null;
}

export interface BusyHoursMember {
  id: string;
  name?: string;
  primaryDepartment?: BusyHoursDepartment | null;
  defaultOrganization?: BusyHoursOrganization | null;
  /** 직책명. 없으면 null */
  positionName?: string | null;
}

export interface BusyHoursRange {
  startedAt?: string;
  endedAt?: string;
}

export interface OfficeHoursRange {
  begin?: string;
  end?: string;
}

export interface BusyHoursEntry {
  member: BusyHoursMember;
  busyHours?: BusyHoursRange[];
  officeHours?: OfficeHoursRange[];
  outOfOfficeHours?: OfficeHoursRange[];
}

/** 요청한 organizationMemberIds 순서대로 온다(공식 문서). */
export type BusyHoursResponse = DoorayApiResponse<BusyHoursEntry[]>;

export interface CalendarClient {
  getCalendars(): Promise<CalendarListResponse>;
  getCalendarEvents(timeMin: string, timeMax: string): Promise<CalendarEventListResponse>;
  getCalendarEvent(calendarId: string, eventId: string): Promise<CalendarEventDetailResponse>;
  createCalendarEvent(calendarId: string, body: CalendarEventWriteRequest): Promise<CreateCalendarEventResponse>;
  updateCalendarEvent(calendarId: string, eventId: string, body: CalendarEventWriteRequest): Promise<UpdateCalendarEventResponse>;
  deleteCalendarEvent(calendarId: string, eventId: string, deleteType: CalendarEventDeleteType): Promise<DeleteCalendarEventResponse>;
  fetchBusyHours(request: BusyHoursRequest): Promise<BusyHoursResponse>;
}
