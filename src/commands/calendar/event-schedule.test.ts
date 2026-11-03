import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
import { resolveEventSchedule, resolveRepeatUntil } from "./event-schedule.js";

// 기대값에 offset 을 박기 위해 시간대를 고정한다. 서머타임 경우는 local-date 테스트가 본다.
const originalTz = process.env.TZ;
beforeEach(() => {
  process.env.TZ = "Asia/Seoul";
});
afterEach(() => {
  if (originalTz == null) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

const paramError = expect.objectContaining({ exitCode: EXIT_PARAM_ERROR });

describe("resolveEventSchedule — 종일 일정", () => {
  it("--end 를 생략하면 그 날 하루이고 endedAt 은 다음 날이다", () => {
    expect(resolveEventSchedule("2026-09-18", undefined)).toEqual({
      startedAt: "2026-09-18+09:00",
      endedAt: "2026-09-19+09:00",
      wholeDayFlag: true,
    });
  });

  it("--end 는 마지막 날(포함)이라 하루를 더해 보낸다", () => {
    expect(resolveEventSchedule("2026-09-18", "2026-09-20")).toEqual({
      startedAt: "2026-09-18+09:00",
      endedAt: "2026-09-21+09:00",
      wholeDayFlag: true,
    });
  });

  it("--end 가 --start 와 같은 날이면 하루짜리다", () => {
    expect(resolveEventSchedule("2026-09-18", "2026-09-18")?.endedAt).toBe("2026-09-19+09:00");
  });

  it("월말 마지막 날은 다음 달 1일로 넘긴다", () => {
    expect(resolveEventSchedule("2026-01-31", undefined)?.endedAt).toBe("2026-02-01+09:00");
  });

  it("윤년 2월 28일의 다음 날은 29일이다", () => {
    expect(resolveEventSchedule("2028-02-28", undefined)?.endedAt).toBe("2028-02-29+09:00");
    expect(resolveEventSchedule("2028-02-29", undefined)?.endedAt).toBe("2028-03-01+09:00");
  });

  it("평년 2월 29일은 없는 날짜라 거부한다", () => {
    expect(() => resolveEventSchedule("2026-02-29", undefined)).toThrow(paramError);
  });

  it("마지막 날이 시작보다 앞서면 거부한다", () => {
    expect(() => resolveEventSchedule("2026-09-18", "2026-09-17")).toThrow(paramError);
  });

  it("날짜와 일시를 섞으면 거부한다", () => {
    expect(() => resolveEventSchedule("2026-09-18", "2026-09-18T10:00:00+09:00")).toThrow(
      /둘 다 날짜만/,
    );
  });
});

describe("resolveEventSchedule — 일반 일정", () => {
  it("offset 붙은 일시는 받은 그대로 보낸다", () => {
    expect(
      resolveEventSchedule("2026-09-20T14:00:00+09:00", "2026-09-20T15:30:00+09:00"),
    ).toEqual({
      startedAt: "2026-09-20T14:00:00+09:00",
      endedAt: "2026-09-20T15:30:00+09:00",
      wholeDayFlag: false,
    });
  });

  it("--end 가 없으면 거부한다", () => {
    expect(() => resolveEventSchedule("2026-09-20T14:00:00+09:00", undefined)).toThrow(
      /--end 가 필요/,
    );
  });

  it("끝이 시작과 같거나 앞서면 거부한다", () => {
    const start = "2026-09-20T14:00:00+09:00";
    expect(() => resolveEventSchedule(start, start)).toThrow(paramError);
    expect(() => resolveEventSchedule(start, "2026-09-20T13:00:00+09:00")).toThrow(paramError);
  });

  it("offset 이 달라도 시각으로 견준다", () => {
    // 05:30Z 는 14:30+09:00 이라 14:00+09:00 보다 뒤다.
    expect(
      resolveEventSchedule("2026-09-20T14:00:00+09:00", "2026-09-20T05:30:00Z")?.wholeDayFlag,
    ).toBe(false);
  });

  it("offset 없는 일시는 거부한다", () => {
    expect(() =>
      resolveEventSchedule("2026-09-20T14:00:00", "2026-09-20T15:00:00+09:00"),
    ).toThrow(/--start 값을 읽을 수 없습니다/);
    expect(() =>
      resolveEventSchedule("2026-09-20T14:00:00+09:00", "2026-09-20T15:00:00"),
    ).toThrow(/--end 값을 읽을 수 없습니다/);
  });

  it("실재하지 않는 시각은 거부한다", () => {
    expect(() =>
      resolveEventSchedule("2026-09-20T25:00:00+09:00", "2026-09-20T26:00:00+09:00"),
    ).toThrow(paramError);
  });

  it("일시와 날짜를 섞으면 거부한다", () => {
    expect(() => resolveEventSchedule("2026-09-20T14:00:00+09:00", "2026-09-21")).toThrow(
      /둘 다 날짜만/,
    );
  });
});

describe("resolveEventSchedule — 수정 경로", () => {
  it("종일 시각에 --end 가 없으면 거부한다. 여러 날 일정이 하루로 줄지 않게 한다", () => {
    expect(() => resolveEventSchedule("2026-10-01", undefined, "edit")).toThrow(/수정에서는 종일 일정도 --end/);
  });

  it("종일 시각에 --end 를 주면 생성과 같이 보낸다", () => {
    expect(resolveEventSchedule("2026-10-01", "2026-10-01", "edit")).toEqual(
      resolveEventSchedule("2026-10-01", "2026-10-01"),
    );
  });

  it("둘 다 없으면 시각을 건드리지 않는다", () => {
    expect(resolveEventSchedule(undefined, undefined)).toBeNull();
  });

  it("--end 만 주면 거부한다", () => {
    expect(() => resolveEventSchedule(undefined, "2026-09-20")).toThrow(/--end 만 줄 수 없습니다/);
  });
});

describe("resolveRepeatUntil", () => {
  it("날짜만 주면 그 날 23:59:59 지역 시각으로 넓힌다", () => {
    expect(resolveRepeatUntil("2026-12-31")).toBe("2026-12-31T23:59:59+09:00");
  });

  it("일시는 그대로 둔다", () => {
    expect(resolveRepeatUntil("2026-12-31T09:00:00+09:00")).toBe("2026-12-31T09:00:00+09:00");
  });

  it("읽을 수 없는 값은 옵션 이름과 함께 거부한다", () => {
    expect(() => resolveRepeatUntil("2026-13-01")).toThrow(/--repeat-until/);
  });
});
