import { describe, expect, it, vi } from "vitest";
import type { DoorayApiClient } from "../api/client.js";
import type { Calendar } from "../api/types.js";
import { EXIT_PARAM_ERROR } from "../utils/exit-codes.js";
import { formatCalendarLabel, resolveWritableCalendar } from "./calendar.js";

function mockClient(calendars: Calendar[]): DoorayApiClient {
  return {
    getCalendars: vi.fn().mockResolvedValue({ result: calendars }),
  } as unknown as DoorayApiClient;
}

const fixture: Calendar[] = [
  { id: "1111222233334444555", name: "내 캘린더", type: "private" },
  { id: "2222333344445555666", name: "팀 캘린더", type: "project" },
  { id: "3333444455556666777", name: "팀 휴가", type: "project" },
  { id: "4444555566667777888", name: "공휴일", type: "subscription" },
];

describe("resolveWritableCalendar", () => {
  it("15자리 이상 숫자는 목록을 보지 않고 id 로 쓴다", async () => {
    const client = mockClient(fixture);
    expect(await resolveWritableCalendar(client, "9999999999999999999")).toEqual({
      id: "9999999999999999999",
    });
    expect(client.getCalendars).not.toHaveBeenCalled();
  });

  it("이름 정확일치", async () => {
    expect(await resolveWritableCalendar(mockClient(fixture), "팀 캘린더")).toEqual({
      id: "2222333344445555666",
      name: "팀 캘린더",
    });
  });

  it("부분일치 하나", async () => {
    expect((await resolveWritableCalendar(mockClient(fixture), "휴가")).id).toBe(
      "3333444455556666777",
    );
  });

  it("부분일치가 여럿이면 후보와 함께 거부한다", async () => {
    await expect(resolveWritableCalendar(mockClient(fixture), "팀")).rejects.toMatchObject({
      exitCode: EXIT_PARAM_ERROR,
      message: expect.stringMatching(/팀 캘린더.*팀 휴가/s),
    });
  });

  it("구독 캘린더는 이름 후보에서 뺀다", async () => {
    await expect(resolveWritableCalendar(mockClient(fixture), "공휴일")).rejects.toMatchObject({
      exitCode: EXIT_PARAM_ERROR,
      message: expect.stringContaining("구독 캘린더"),
    });
  });
});

describe("formatCalendarLabel", () => {
  it("이름을 알면 이름과 id, 모르면 id 만 낸다", () => {
    expect(formatCalendarLabel({ id: "1111222233334444555", name: "팀 캘린더" })).toBe(
      "팀 캘린더 (1111222233334444555)",
    );
    expect(formatCalendarLabel({ id: "1111222233334444555" })).toBe("1111222233334444555");
  });

  it("이름의 control char 를 없앤다", () => {
    expect(formatCalendarLabel({ id: "1", name: "팀\u001b[31m" })).not.toContain("\u001b");
  });
});
