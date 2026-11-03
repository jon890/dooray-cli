import { afterEach, describe, expect, it } from "vitest";
import {
  addDays,
  DAY_END,
  DAY_START,
  expandDateInZone,
  expandLocalDate,
  formatLocalDateWithOffset,
  isDateOnlyForm,
  localOffset,
  parseIsoInstant,
  parseLocalDate,
} from "./local-date.js";

describe("localOffset", () => {
  it("`+HH:MM` 형태로 낸다", () => {
    expect(localOffset(new Date(2026, 8, 20, 0, 0, 0))).toMatch(/^[+-]\d{2}:\d{2}$/);
  });
});

describe("parseLocalDate", () => {
  it("달력에 있는 날짜를 읽는다", () => {
    expect(parseLocalDate("2026-09-01")).toEqual({ year: 2026, month: 9, day: 1 });
  });

  it("형태는 맞아도 달력에 없는 날짜는 null", () => {
    expect(isDateOnlyForm("2026-02-31")).toBe(true);
    expect(parseLocalDate("2026-02-31")).toBeNull();
  });

  it("자릿수가 다르면 null", () => {
    expect(parseLocalDate("2026-9-1")).toBeNull();
  });
});

describe("parseIsoInstant", () => {
  it("날짜 부분과 offset 을 떼어 준다", () => {
    expect(parseIsoInstant("2026-09-01T09:00:00.123+09:00")).toEqual({
      date: "2026-09-01",
      offset: "+09:00",
    });
    expect(parseIsoInstant("2026-09-01T09:00:00Z")).toEqual({ date: "2026-09-01", offset: "Z" });
  });

  it.each([
    "2026-09-01T09:00:00",
    "2026-02-31T09:00:00+09:00",
    "2026-09-01T24:00:00+09:00",
    "2026-09-01T09:00:00+15:00",
    "2026-09-01T09:00:00+09:60",
  ])("%s 는 null", (value) => {
    expect(parseIsoInstant(value)).toBeNull();
  });
});

describe("expandLocalDate", () => {
  it("그 날짜의 지역 offset 을 붙인다", () => {
    const date = { year: 2026, month: 9, day: 1 };
    expect(expandLocalDate(date, DAY_START)).toBe(
      `2026-09-01T00:00:00${localOffset(new Date(2026, 8, 1, 0, 0, 0))}`,
    );
    expect(expandLocalDate(date, DAY_END)).toBe(
      `2026-09-01T23:59:59${localOffset(new Date(2026, 8, 1, 23, 59, 59))}`,
    );
  });
});

describe("expandDateInZone", () => {
  // 장비 시간대와 상관없이 지정한 시간대의 그 날짜 offset 을 붙인다.
  it.each([
    ["Asia/Seoul", { year: 2026, month: 12, day: 31 }, "2026-12-31T23:59:59+09:00"],
    ["America/New_York", { year: 2026, month: 12, day: 31 }, "2026-12-31T23:59:59-05:00"],
    ["America/New_York", { year: 2027, month: 7, day: 1 }, "2027-07-01T23:59:59-04:00"],
    ["UTC", { year: 2026, month: 12, day: 31 }, "2026-12-31T23:59:59+00:00"],
    ["Asia/Kolkata", { year: 2026, month: 12, day: 31 }, "2026-12-31T23:59:59+05:30"],
    ["Asia/Kathmandu", { year: 2026, month: 12, day: 31 }, "2026-12-31T23:59:59+05:45"],
  ])("%s 의 %o 는 %s", (zone, date, expected) => {
    expect(expandDateInZone(date, DAY_END, zone)).toBe(expected);
  });

  it("서머타임이 시작하는 날도 그 시각의 offset 을 붙인다", () => {
    // 2027-03-14 02:00 에 -05:00 에서 -04:00 으로 바뀐다.
    expect(expandDateInZone({ year: 2027, month: 3, day: 14 }, DAY_START, "America/New_York")).toBe(
      "2027-03-14T00:00:00-05:00",
    );
    expect(expandDateInZone({ year: 2027, month: 3, day: 14 }, DAY_END, "America/New_York")).toBe(
      "2027-03-14T23:59:59-04:00",
    );
  });

  it("서머타임이 끝나는 날도 그 시각의 offset 을 붙인다", () => {
    // 2026-11-01 02:00 에 -04:00 에서 -05:00 으로 바뀐다.
    expect(expandDateInZone({ year: 2026, month: 11, day: 1 }, DAY_START, "America/New_York")).toBe(
      "2026-11-01T00:00:00-04:00",
    );
    expect(expandDateInZone({ year: 2026, month: 11, day: 1 }, DAY_END, "America/New_York")).toBe(
      "2026-11-01T23:59:59-05:00",
    );
  });

  it("시간대 이름이 잘못됐으면 null 이다", () => {
    expect(expandDateInZone({ year: 2026, month: 12, day: 31 }, DAY_END, "Not/AZone")).toBeNull();
  });
});

describe("서머타임이 있는 시간대", () => {
  const originalTz = process.env.TZ;
  afterEach(() => {
    // Node 는 TZ 를 바꾸면 곧바로 반영한다. 다른 테스트에 새지 않게 되돌린다.
    if (originalTz == null) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  it("날짜마다 그 날의 offset 을 붙인다", () => {
    process.env.TZ = "America/New_York";

    // 지금 시각의 offset 을 빌려 쓰면 둘 중 한쪽이 한 시간 어긋난다.
    expect(expandLocalDate({ year: 2026, month: 1, day: 15 }, DAY_START)).toBe(
      "2026-01-15T00:00:00-05:00",
    );
    expect(expandLocalDate({ year: 2026, month: 7, day: 15 }, DAY_END)).toBe(
      "2026-07-15T23:59:59-04:00",
    );
  });
});

describe("addDays", () => {
  it("월말을 넘기면 다음 달 1일이다", () => {
    expect(addDays({ year: 2026, month: 1, day: 31 }, 1)).toEqual({ year: 2026, month: 2, day: 1 });
  });

  it("윤년 2월 28일 다음은 29일, 평년은 3월 1일이다", () => {
    expect(addDays({ year: 2028, month: 2, day: 28 }, 1)).toEqual({ year: 2028, month: 2, day: 29 });
    expect(addDays({ year: 2026, month: 2, day: 28 }, 1)).toEqual({ year: 2026, month: 3, day: 1 });
  });

  it("연말을 넘기면 다음 해다", () => {
    expect(addDays({ year: 2026, month: 12, day: 31 }, 1)).toEqual({ year: 2027, month: 1, day: 1 });
  });
});

describe("formatLocalDateWithOffset", () => {
  const originalTz = process.env.TZ;
  afterEach(() => {
    if (originalTz == null) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  it("날짜에 그 날의 지역 offset 을 붙인다", () => {
    process.env.TZ = "Asia/Seoul";
    expect(formatLocalDateWithOffset({ year: 2026, month: 9, day: 18 })).toBe("2026-09-18+09:00");
  });

  it("서머타임 지역은 날짜마다 offset 이 다르다", () => {
    process.env.TZ = "America/New_York";
    expect(formatLocalDateWithOffset({ year: 2026, month: 1, day: 15 })).toBe("2026-01-15-05:00");
    expect(formatLocalDateWithOffset({ year: 2026, month: 7, day: 15 })).toBe("2026-07-15-04:00");
  });
});
