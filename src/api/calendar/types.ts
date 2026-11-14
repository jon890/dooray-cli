/** calendar 영역의 공개 메서드 계약. DTO 는 api/types.ts 가 소유한다. */
import type { CalendarListResponse, CalendarEventListResponse, CalendarEventDetailResponse, CalendarEventWriteRequest, CreateCalendarEventResponse, UpdateCalendarEventResponse, CalendarEventDeleteType, DeleteCalendarEventResponse, BusyHoursRequest, BusyHoursResponse } from "../types.js";

export interface CalendarClient {
  getCalendars(): Promise<CalendarListResponse>;
  getCalendarEvents(timeMin: string, timeMax: string): Promise<CalendarEventListResponse>;
  getCalendarEvent(calendarId: string, eventId: string): Promise<CalendarEventDetailResponse>;
  createCalendarEvent(calendarId: string, body: CalendarEventWriteRequest): Promise<CreateCalendarEventResponse>;
  updateCalendarEvent(calendarId: string, eventId: string, body: CalendarEventWriteRequest): Promise<UpdateCalendarEventResponse>;
  deleteCalendarEvent(calendarId: string, eventId: string, deleteType: CalendarEventDeleteType): Promise<DeleteCalendarEventResponse>;
  fetchBusyHours(request: BusyHoursRequest): Promise<BusyHoursResponse>;
}
