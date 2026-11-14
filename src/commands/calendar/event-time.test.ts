import { describe, expect, it } from "vitest";
import type { CalendarEvent } from "@/api/calendar/types.js";
import { formatEventTime } from "./event-time.js";

// ANSI escape 시작 바이트. 리터럴로 두면 편집기에서 보이지 않아 escape 표기로 쓴다.
const ESC = "\u001b";

describe("formatEventTime", () => {
  function format(event: CalendarEvent): string {
    return formatEventTime(event);
  }

  it("같은 날에 끝나면 날짜를 한 번만 적는다", () => {
    expect(
      format({
        id: "e",
        startedAt: "2026-09-20T10:00:00+09:00",
        endedAt: "2026-09-20T11:30:00+09:00",
      }),
    ).toBe("2026-09-20 10:00-11:30");
  });

  it("날을 넘기면 양쪽 날짜를 모두 적는다", () => {
    expect(
      format({
        id: "e",
        startedAt: "2026-09-20T23:00:00+09:00",
        endedAt: "2026-09-21T01:00:00+09:00",
      }),
    ).toBe("2026-09-20 23:00 ~ 2026-09-21 01:00");
  });

  it("하루짜리 종일 일정은 날짜 하나로 적는다", () => {
    // endedAt 은 그 날을 포함하지 않는다 — 09-19 로 끝나는 일정의 마지막 날은 09-18 이다.
    expect(
      format({
        id: "e",
        startedAt: "2026-09-18+09:00",
        endedAt: "2026-09-19+09:00",
        wholeDayFlag: true,
      }),
    ).toBe("2026-09-18 (종일)");
  });

  it("여러 날 종일 일정은 마지막 날까지 기간으로 적는다", () => {
    expect(
      format({
        id: "e",
        startedAt: "2026-09-18+09:00",
        endedAt: "2026-09-21+09:00",
        wholeDayFlag: true,
      }),
    ).toBe("2026-09-18 ~ 2026-09-20 (종일)");
  });

  it("달을 넘기는 종일 일정도 마지막 날을 바르게 낸다", () => {
    expect(
      format({
        id: "e",
        startedAt: "2026-09-21+09:00",
        endedAt: "2026-10-01+09:00",
        wholeDayFlag: true,
      }),
    ).toBe("2026-09-21 ~ 2026-09-30 (종일)");
  });

  it("+09:00 이 아닌 종일 일정은 원형을 그대로 둔다", () => {
    expect(
      format({
        id: "e",
        startedAt: "2026-09-18Z",
        endedAt: "2026-09-19Z",
        wholeDayFlag: true,
      }),
    ).toBe("2026-09-18Z (종일)");
  });

  it("종료값만 해석되지 않으면 시작 날짜만 적는다", () => {
    expect(
      format({
        id: "e",
        startedAt: "2026-09-18+09:00",
        endedAt: "2026-09-19Z",
        wholeDayFlag: true,
      }),
    ).toBe("2026-09-18 (종일)");
  });

  it("+09:00 이 아닌 offset 은 원형을 그대로 둔다", () => {
    expect(
      format({
        id: "e",
        startedAt: "2026-09-20T10:00:00Z",
        endedAt: "2026-09-20T11:00:00Z",
      }),
    ).toBe("2026-09-20T10:00:00Z ~ 2026-09-20T11:00:00Z");
  });

  it("시각이 없으면 빈 문자열을 낸다", () => {
    expect(format({ id: "e" })).toBe("");
  });

  it("해석되지 않아 원형으로 나가는 값의 control char 를 없앤다", () => {
    // 폴백 경로는 서버 문자열을 그대로 돌려주므로 여기가 마지막 방어선이다.
    expect(
      format({ id: "e", startedAt: `2026-09-20T10:00:00${ESC}[31m+00:00` }),
    ).toBe("2026-09-20T10:00:00?[31m+00:00");
  });

  it("종일 폴백 경로의 control char 도 없앤다", () => {
    expect(
      format({ id: "e", startedAt: `2026-09-18${ESC}[31mZ`, wholeDayFlag: true }),
    ).toBe("2026-09-18?[31mZ (종일)");
  });
});
