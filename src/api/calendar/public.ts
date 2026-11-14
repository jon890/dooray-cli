import type { PublicHttp } from "@/api/public/http.js";
import type { CalendarClient, BusyHoursRequest, BusyHoursResponse, CalendarEventDeleteType, CalendarEventDetailResponse, CalendarEventListResponse, CalendarEventWriteRequest, CalendarListResponse, CreateCalendarEventResponse, DeleteCalendarEventResponse, UpdateCalendarEventResponse } from "./types.js";
import { apiPath } from "@/api/api-path.js";
import { DoorayCliError } from "@/utils/errors.js";
import { toDoorayCliError } from "@/api/public/http.js";

/** calendar 영역의 공개 API 구현. 공용 HTTP 는 PublicHttp 가 맡는다. */
export function createCalendarPublic(http: PublicHttp): CalendarClient {
  return {
    async getCalendars(): Promise<CalendarListResponse> {
      try {
        return await http.api
          .get("calendar/v1/calendars")
          .json<CalendarListResponse>();
      } catch (e) {
        throw await toDoorayCliError(e);
      }
    },

    /**
     * 기간 안의 일정 목록. 접근 가능한 캘린더 전체를 훑는다.
     *
     * calendarId 자리에는 `*` 만 들어갈 수 있다(공식 문서). 상세 조회는 거꾸로 `*` 를 받지 않는다.
     * 경로를 상수로 끼우지 않고 리터럴로 둔다. `pnpm api:inventory` 가 템플릿 보간을 `{id}` 로 바꿔
     * 공식 목록의 `*` 와 대조하지 못하게 된다.
     * 기간은 50일까지만 받고 넘으면 400 이 온다(실측).
     *
     * `timeMin` 하나만 주면 무시되므로 부르는 쪽이 항상 둘 다 채운다.
     * `size` 와 `page` 는 먹지 않아 페이징 수단이 없고, 범위를 좁히는 것이 유일한 조절 수단이다.
     * 서버에 날짜 형식 검증이 없어 어긋난 값에는 500 이 오므로 부르기 전에 형식을 거른다.
     */
    async getCalendarEvents(timeMin: string, timeMax: string): Promise<CalendarEventListResponse> {
      try {
        return await http.api
          .get("calendar/v1/calendars/*/events", {
            searchParams: { timeMin, timeMax },
          })
          .json<CalendarEventListResponse>();
      } catch (e) {
        throw await toDoorayCliError(e);
      }
    },

    async getCalendarEvent(
      calendarId: string,
      eventId: string,
    ): Promise<CalendarEventDetailResponse> {
      try {
        return await http.api
          .get(apiPath`calendar/v1/calendars/${calendarId}/events/${eventId}`)
          .json<CalendarEventDetailResponse>();
      } catch (e) {
        throw await toDoorayCliError(e);
      }
    },

    async createCalendarEvent(
      calendarId: string,
      body: CalendarEventWriteRequest,
    ): Promise<CreateCalendarEventResponse> {
      try {
        return await http.api
          .post(apiPath`calendar/v1/calendars/${calendarId}/events`, { json: body })
          .json<CreateCalendarEventResponse>();
      } catch (e) {
        throw await toDoorayCliError(e);
      }
    },

    /** 빈 값이 아닌 필드만 반영한다(공식 문서). 성공 응답의 `result` 는 `null` 이다. */
    async updateCalendarEvent(
      calendarId: string,
      eventId: string,
      body: CalendarEventWriteRequest,
    ): Promise<UpdateCalendarEventResponse> {
      try {
        return await http.api
          .put(apiPath`calendar/v1/calendars/${calendarId}/events/${eventId}`, { json: body })
          .json<UpdateCalendarEventResponse>();
      } catch (e) {
        throw await toDoorayCliError(e);
      }
    },

    /**
     * 삭제는 `DELETE` 가 아니라 `POST .../delete` 다(공식 문서).
     * 반복 일정의 한 회차는 `<eventId>-20240228T013000Z` 같은 id 를 그대로 경로에 넣는다.
     */
    async deleteCalendarEvent(
      calendarId: string,
      eventId: string,
      deleteType: CalendarEventDeleteType,
    ): Promise<DeleteCalendarEventResponse> {
      try {
        return await http.api
          .post(apiPath`calendar/v1/calendars/${calendarId}/events/${eventId}/delete`, {
            json: { deleteType },
          })
          .json<DeleteCalendarEventResponse>();
      } catch (e) {
        throw await toDoorayCliError(e);
      }
    },

    /**
     * 멤버별 바쁨 시간. 응답의 `member` 에 소속 회사·부서·직책이 함께 온다.
     *
     * `member get` 응답에는 부서와 직책이 없고 회사도 id 뿐이라, 이름은 이 endpoint 로만 얻는다.
     * 공식 문서상 기간은 7일 미만, 멤버는 한 번에 20명까지다.
     */
    async fetchBusyHours(request: BusyHoursRequest): Promise<BusyHoursResponse> {
      try {
        return await http.api
          .post("calendar/v1/fetch-busy-hours", { json: request })
          .json<BusyHoursResponse>();
      } catch (e) {
        throw await toDoorayCliError(e);
      }
    },
  };
}
