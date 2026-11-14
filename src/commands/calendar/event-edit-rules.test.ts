import { describe, expect, it, vi } from "vitest";
import type { CalendarClient, CalendarEventWriteRequest } from "@/api/calendar/types.js";
import { DoorayCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
import { mergeExistingEventFields, rejectInstanceId } from "./event-edit-rules.js";
import type { EventFieldOptions } from "./event-write.js";

function clientWith(getCalendarEvent: ReturnType<typeof vi.fn>): CalendarClient {
  return { getCalendarEvent } as unknown as CalendarClient;
}

describe("rejectInstanceId", () => {
  it("반복 일정의 회차 id 는 원본 id 를 안내하며 거부한다", () => {
    let error: unknown;
    try {
      rejectInstanceId("abc-20240228T013000Z");
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(DoorayCliError);
    expect((error as DoorayCliError).exitCode).toBe(EXIT_PARAM_ERROR);
    expect((error as DoorayCliError).message).toContain("abc");
  });

  it("일반 id 는 통과한다", () => {
    expect(() => rejectInstanceId("abc")).not.toThrow();
  });
});

describe("mergeExistingEventFields", () => {
  it("users·recurrenceRule 을 바꾸지 않는 수정은 상세를 조회하지 않는다", async () => {
    const get = vi.fn();
    const request: CalendarEventWriteRequest = { subject: "새 제목" };
    const merged = await mergeExistingEventFields(clientWith(get), "cal-1", "event-1", request, {} as EventFieldOptions);
    expect(get).not.toHaveBeenCalled();
    expect(merged).toEqual({ request, recurrenceDropped: [], unreadableZone: undefined });
  });

  it("--to 만 주면 기존 cc 를 조회해 채운다", async () => {
    const existingCc = [{ type: "member", member: { organizationMemberId: "m-2" } }];
    const get = vi.fn().mockResolvedValue({ result: { users: { to: [], cc: existingCc } } });
    const request = { users: { to: [{ type: "member", member: { organizationMemberId: "m-1" } }] } } as CalendarEventWriteRequest;
    const merged = await mergeExistingEventFields(clientWith(get), "cal-1", "event-1", request, {} as EventFieldOptions);
    expect(get).toHaveBeenCalledWith("cal-1", "event-1");
    expect(merged.request.users?.cc).toEqual(existingCc);
  });
});
