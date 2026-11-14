import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import type { CalendarEvent } from "@/api/calendar/types.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";

const mocks = vi.hoisted(() => ({
  getConfigOrThrow: vi.fn(),
  startSpinner: vi.fn(),
  stopSpinner: vi.fn(),
  client: {
    getCalendarEvents: vi.fn(),
  },
}));

vi.mock("../../config/store.js", () => ({
  getConfigOrThrow: mocks.getConfigOrThrow,
}));

vi.mock("../../api/client.js", () => ({
  DoorayApiClient: vi.fn(function MockDoorayApiClient() {
    return mocks.client;
  }),
}));

vi.mock("../../utils/spinner.js", () => ({
  startSpinner: mocks.startSpinner,
  stopSpinner: mocks.stopSpinner,
}));

// ANSI escape 시작 바이트. 리터럴로 두면 편집기에서 보이지 않아 escape 표기로 쓴다.
const ESC = "\u001b";

const events: CalendarEvent[] = [
  {
    id: "event-1",
    subject: "스프린트 계획",
    startedAt: "2026-09-20T10:00:00+09:00",
    endedAt: "2026-09-20T11:00:00+09:00",
    wholeDayFlag: false,
    calendar: { id: "cal-1", name: "내 캘린더" },
    me: {
      type: "member",
      member: { organizationMemberId: "member-1", name: "홍길동", emailAddress: "user@example.com" },
      status: "accepted",
      userType: "to",
    },
  },
  {
    id: "event-2",
    subject: "워크숍",
    // 종일 일정은 시각 없이 날짜와 offset 만 온다 (일반 일정과 형식이 다르다).
    startedAt: "2026-09-20+09:00",
    endedAt: "2026-09-21+09:00",
    wholeDayFlag: true,
    calendar: { id: "cal-2", name: "팀 캘린더" },
    // 공유받은 캘린더의 남의 일정은 status·userType 없이 온다.
    me: { type: "member", member: { organizationMemberId: "member-1" } },
  },
];

function exitOverrideAll(cmd: Command): void {
  cmd.exitOverride();
  cmd.configureOutput({ writeErr: () => {} });
  cmd.commands.forEach(exitOverrideAll);
}

async function createCommandTree(): Promise<Command> {
  vi.resetModules();
  const { calendarCommand } = await import("./index.js");
  const program = new Command()
    .name("dooray")
    .option("--json", "JSON 형식으로 출력")
    .option("--quiet", "ID만 출력")
    .option("--no-color", "색상 비활성화");
  program.addCommand(calendarCommand);
  return program;
}

async function run(argv: string[]): Promise<string> {
  const program = await createCommandTree();
  exitOverrideAll(program);
  const chunks: string[] = [];
  const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    chunks.push(String(chunk));
    return true;
  });
  try {
    await program.parseAsync(["node", "dooray", ...argv]);
  } finally {
    spy.mockRestore();
  }
  return chunks.join("");
}

/** 실행 장비의 타임존에 따라 offset 이 달라지므로 기대값을 박지 않고 그 장비의 값을 쓴다. */
async function offsetOn(year: number, month: number, day: number, hour: number): Promise<string> {
  const { localOffset } = await import("../../utils/local-date.js");
  return localOffset(new Date(year, month - 1, day, hour, 0, 0));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 8, 20, 15, 30, 0)); // 2026-09-20 15:30 로컬
  mocks.getConfigOrThrow.mockResolvedValue({
    apiKey: "test-api-key",
    baseUrl: "https://example.dooray.com",
  });
  mocks.client.getCalendarEvents.mockResolvedValue({
    header: { isSuccessful: true, resultCode: 0, resultMessage: "" },
    result: events,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("calendar event list", () => {
  it("옵션이 없으면 오늘 하루를 보낸다", async () => {
    await run(["calendar", "event", "list"]);
    expect(mocks.client.getCalendarEvents).toHaveBeenCalledWith(
      `2026-09-20T00:00:00${await offsetOn(2026, 9, 20, 0)}`,
      `2026-09-20T23:59:59${await offsetOn(2026, 9, 20, 23)}`,
    );
  });

  it("날짜만 준 --from 과 --to 를 하루의 시작과 끝으로 늘린다", async () => {
    await run(["calendar", "event", "list", "--from", "2026-09-18", "--to", "2026-09-22"]);
    expect(mocks.client.getCalendarEvents).toHaveBeenCalledWith(
      `2026-09-18T00:00:00${await offsetOn(2026, 9, 18, 0)}`,
      `2026-09-22T23:59:59${await offsetOn(2026, 9, 22, 23)}`,
    );
  });

  it("--from 만 줘도 그 날 하루로 채워 항상 둘 다 보낸다", async () => {
    await run(["calendar", "event", "list", "--from", "2026-09-18"]);
    expect(mocks.client.getCalendarEvents).toHaveBeenCalledWith(
      `2026-09-18T00:00:00${await offsetOn(2026, 9, 18, 0)}`,
      `2026-09-18T23:59:59${await offsetOn(2026, 9, 18, 23)}`,
    );
  });

  it("--from 만 준 미래 날짜도 뒤집히지 않고 그 날 하루를 본다", async () => {
    await run(["calendar", "event", "list", "--from", "2026-10-01"]);
    expect(mocks.client.getCalendarEvents).toHaveBeenCalledWith(
      `2026-10-01T00:00:00${await offsetOn(2026, 10, 1, 0)}`,
      `2026-10-01T23:59:59${await offsetOn(2026, 10, 1, 23)}`,
    );
  });

  it("뒤집힌 범위는 거부하고 API 를 부르지 않는다", async () => {
    await expect(
      run(["calendar", "event", "list", "--from", "2026-10-01", "--to", "2026-09-20"]),
    ).rejects.toThrow(/--from 이 --to 보다 뒤/);
    expect(mocks.client.getCalendarEvents).not.toHaveBeenCalled();
  });

  it("50일을 넘는 범위는 거부하고 API 를 부르지 않는다", async () => {
    await expect(
      run(["calendar", "event", "list", "--from", "2026-01-01", "--to", "2026-02-21"]),
    ).rejects.toMatchObject({ exitCode: EXIT_PARAM_ERROR, message: expect.stringMatching(/최대 50일/) });
    expect(mocks.client.getCalendarEvents).not.toHaveBeenCalled();
  });

  it("ISO8601 은 그대로 보낸다", async () => {
    await run([
      "calendar", "event", "list",
      "--from", "2026-09-20T09:00:00+09:00",
      "--to", "2026-09-20T18:00:00+09:00",
    ]);
    expect(mocks.client.getCalendarEvents).toHaveBeenCalledWith(
      "2026-09-20T09:00:00+09:00",
      "2026-09-20T18:00:00+09:00",
    );
  });

  it("잘못된 형식은 거부하고 API 를 부르지 않는다", async () => {
    await expect(run(["calendar", "event", "list", "--from", "2026/09/20"])).rejects.toThrow(
      /--from 값을 읽을 수 없습니다/,
    );
    expect(mocks.client.getCalendarEvents).not.toHaveBeenCalled();
  });

  it("형식 오류의 종료 코드는 EXIT_PARAM_ERROR 다", async () => {
    await expect(
      run(["calendar", "event", "list", "--to", "내일"]),
    ).rejects.toMatchObject({ exitCode: EXIT_PARAM_ERROR });
  });

  it("표는 시각·제목·캘린더명을 낸다", async () => {
    const out = await run(["calendar", "event", "list"]);
    expect(out).toContain("2026-09-20 10:00-11:00");
    expect(out).toContain("스프린트 계획");
    expect(out).toContain("내 캘린더");
    expect(out).toContain("2026-09-20 (종일)");
  });

  it("표의 내 참여 열은 참여한 일정에만 채운다", async () => {
    const out = await run(["calendar", "event", "list"]);
    expect(out).toContain("내 참여");
    const lines = out.split("\n");
    expect(lines.find((l) => l.includes("스프린트 계획"))).toContain("참석·수락");
    const workshop = lines.find((l) => l.includes("워크숍"))!;
    expect(workshop).not.toMatch(/주최|참석|참조/);
  });

  it("--json 은 서버 응답 result 원형을 낸다", async () => {
    const out = await run(["--json", "calendar", "event", "list"]);
    expect(JSON.parse(out)).toEqual(events);
  });

  it("--quiet 은 일정 id 만 낸다", async () => {
    const out = await run(["--quiet", "calendar", "event", "list"]);
    expect(out.trim().split("\n")).toEqual(["event-1", "event-2"]);
  });

  it("제목의 control char 를 출력 직전에 없앤다", async () => {
    mocks.client.getCalendarEvents.mockResolvedValue({
      header: { isSuccessful: true, resultCode: 0, resultMessage: "" },
      result: [
        {
          id: "event-9",
          subject: `정상${ESC}[31m빨강`,
          startedAt: "2026-09-20T10:00:00+09:00",
          endedAt: "2026-09-20T11:00:00+09:00",
          calendar: { id: "cal-1", name: "내 캘린더" },
        },
      ],
    });
    const out = await run(["calendar", "event", "list"]);
    // cli-table3 이 테두리에 쓰는 escape 와 섞이므로, 주입한 escape 가 ? 로 바뀌었는지로 판정한다.
    expect(out).toContain("정상?[31m빨강");
    expect(out).not.toContain(`정상${ESC}`);
  });

  describe("결과가 0건", () => {
    beforeEach(() => {
      mocks.client.getCalendarEvents.mockResolvedValue({
        header: { isSuccessful: true, resultCode: 0, resultMessage: "" },
        result: [],
      });
    });

    it("표 모드는 빈 표 대신 안내를 낸다", async () => {
      const out = await run(["calendar", "event", "list"]);
      expect(out).toBe("일정이 없습니다.\n");
    });

    it("--quiet 은 아무것도 출력하지 않는다", async () => {
      const out = await run(["--quiet", "calendar", "event", "list"]);
      expect(out).toBe("");
    });

    it("--json 은 빈 배열을 낸다", async () => {
      const out = await run(["--json", "calendar", "event", "list"]);
      expect(JSON.parse(out)).toEqual([]);
    });
  });
});
