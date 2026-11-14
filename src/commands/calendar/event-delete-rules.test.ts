import { describe, expect, it, vi } from "vitest";
import type { CalendarClient } from "@/api/calendar/types.js";
import { DoorayCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
import { describeEvent, rejectSeriesDeleteByThis, toDeleteType, type DeleteContext } from "./event-delete-rules.js";

function context(getCalendarEvent: CalendarClient["getCalendarEvent"]): DeleteContext {
  return {
    client: { getCalendarEvent } as unknown as CalendarClient,
    calendar: { id: "cal-1", name: "내 캘린더" } as DeleteContext["calendar"],
  };
}

describe("toDeleteType", () => {
  it("--scope 값을 API 의 deleteType 으로 바꾼다", () => {
    expect(toDeleteType("this")).toBe("this");
    expect(toDeleteType("from-this")).toBe("wholeFromThis");
    expect(toDeleteType("all")).toBe("whole");
  });
});

describe("rejectSeriesDeleteByThis", () => {
  it("반복 일정의 원본 id 에 this 범위면 거부한다", async () => {
    const get = vi.fn().mockResolvedValue({ result: { recurrenceRule: { frequency: "daily" } } });
    const error = await rejectSeriesDeleteByThis(context(get), "event-1", "this").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DoorayCliError);
    expect((error as DoorayCliError).exitCode).toBe(EXIT_PARAM_ERROR);
  });

  it("반복이 아닌 일정이면 조회한 상세를 돌려준다", async () => {
    const detail = { subject: "회의" };
    const get = vi.fn().mockResolvedValue({ result: detail });
    await expect(rejectSeriesDeleteByThis(context(get), "event-1", "this")).resolves.toBe(detail);
  });

  it("this 가 아닌 범위는 상세를 조회하지 않는다", async () => {
    const get = vi.fn();
    await expect(rejectSeriesDeleteByThis(context(get), "event-1", "all")).resolves.toBeUndefined();
    expect(get).not.toHaveBeenCalled();
  });
});

describe("describeEvent", () => {
  it("상세 조회가 실패해도 id 만으로 확인 문구를 만든다", async () => {
    const get = vi.fn().mockRejectedValue(new Error("network"));
    await expect(describeEvent(context(get), "event-1")).resolves.toBe("일정 event-1");
  });
});
