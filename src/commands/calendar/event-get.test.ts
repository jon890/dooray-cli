import { beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import type { CalendarEventDetail } from "@/api/calendar/types.js";

const mocks = vi.hoisted(() => ({
  getConfigOrThrow: vi.fn(),
  startSpinner: vi.fn(),
  stopSpinner: vi.fn(),
  client: {
    getCalendarEvent: vi.fn(),
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

const CALENDAR_ID = "cal-1";
const EVENT_ID = "event-1";
const NAMELESS_MEMBER_ID = "1111222233334444555";
// ANSI escape 시작 바이트. 리터럴로 두면 편집기에서 보이지 않아 escape 표기로 쓴다.
const ESC = "\u001b";

const detail: CalendarEventDetail = {
  id: EVENT_ID,
  subject: "스프린트 계획",
  startedAt: "2026-09-20T10:00:00+09:00",
  endedAt: "2026-09-20T11:00:00+09:00",
  wholeDayFlag: false,
  location: "회의실 A",
  calendar: { id: CALENDAR_ID, name: "팀 캘린더" },
  users: {
    from: { type: "member", status: "accepted", member: { name: "홍길동" } },
    to: [
      { type: "member", status: "pending", member: { name: "김철수" } },
      { type: "member", status: "pending", member: { organizationMemberId: NAMELESS_MEMBER_ID } },
    ],
    cc: [],
  },
  body: { mimeType: "text/x-markdown", content: "안건 정리" },
};

function exitOverrideAll(cmd: Command): void {
  cmd.exitOverride();
  cmd.configureOutput({ writeErr: () => {} });
  cmd.commands.forEach(exitOverrideAll);
}

async function run(argv: string[]): Promise<string> {
  vi.resetModules();
  const { calendarCommand } = await import("./index.js");
  const program = new Command()
    .name("dooray")
    .option("--json", "JSON 형식으로 출력")
    .option("--quiet", "ID만 출력")
    .option("--no-color", "색상 비활성화");
  program.addCommand(calendarCommand);
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

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getConfigOrThrow.mockResolvedValue({
    apiKey: "test-api-key",
    baseUrl: "https://example.dooray.com",
  });
  mocks.client.getCalendarEvent.mockResolvedValue({
    header: { isSuccessful: true, resultCode: 0, resultMessage: "" },
    result: detail,
  });
});

describe("calendar event get", () => {
  it("두 id 를 그대로 API 에 넘긴다", async () => {
    await run(["calendar", "event", "get", CALENDAR_ID, EVENT_ID]);
    expect(mocks.client.getCalendarEvent).toHaveBeenCalledWith(CALENDAR_ID, EVENT_ID);
  });

  it("표는 제목·시각·장소·등록자·참석자를 낸다", async () => {
    const out = await run(["calendar", "event", "get", CALENDAR_ID, EVENT_ID]);
    expect(out).toContain("스프린트 계획");
    expect(out).toContain("2026-09-20 10:00-11:00");
    expect(out).toContain("회의실 A");
    expect(out).toContain("홍길동");
    expect(out).toContain("김철수");
  });

  it("이름이 없는 참석자는 id 로 대신한다", async () => {
    const out = await run(["calendar", "event", "get", CALENDAR_ID, EVENT_ID]);
    expect(out).toContain(NAMELESS_MEMBER_ID);
  });

  it("참조가 비어 있으면 그 줄을 내지 않는다", async () => {
    const out = await run(["calendar", "event", "get", CALENDAR_ID, EVENT_ID]);
    expect(out).not.toContain("참조");
  });

  it("참조가 있으면 그 줄을 낸다", async () => {
    mocks.client.getCalendarEvent.mockResolvedValue({
      header: { isSuccessful: true, resultCode: 0, resultMessage: "" },
      result: {
        ...detail,
        users: { ...detail.users, cc: [{ member: { name: "이영희" } }] },
      },
    });
    const out = await run(["calendar", "event", "get", CALENDAR_ID, EVENT_ID]);
    expect(out).toContain("참조");
    expect(out).toContain("이영희");
  });

  it("종일 일정은 (종일) 로 적는다", async () => {
    mocks.client.getCalendarEvent.mockResolvedValue({
      header: { isSuccessful: true, resultCode: 0, resultMessage: "" },
      result: {
        ...detail,
        // 종일 일정은 시각 없이 날짜와 offset 만 온다. endedAt 은 그 날을 포함하지 않는다.
        startedAt: "2026-09-20+09:00",
        endedAt: "2026-09-21+09:00",
        wholeDayFlag: true,
      },
    });
    const out = await run(["calendar", "event", "get", CALENDAR_ID, EVENT_ID]);
    expect(out).toContain("2026-09-20 (종일)");
  });

  describe("본문", () => {
    function withBody(content: string): void {
      mocks.client.getCalendarEvent.mockResolvedValue({
        header: { isSuccessful: true, resultCode: 0, resultMessage: "" },
        result: { ...detail, body: { mimeType: "text/x-markdown", content } },
      });
    }

    it("본문을 표에 싣는다", async () => {
      const out = await run(["calendar", "event", "get", CALENDAR_ID, EVENT_ID]);
      expect(out).toContain("본문");
      expect(out).toContain("안건 정리");
    });

    it("여러 줄 본문은 줄바꿈을 살려 줄마다 낸다", async () => {
      withBody("첫째 줄\n둘째 줄\r\n셋째 줄");
      const out = await run(["calendar", "event", "get", CALENDAR_ID, EVENT_ID]);
      const lines = out.split("\n");
      // 한 줄로 뭉개졌다면 세 문구가 같은 줄에 있다.
      const first = lines.findIndex((l) => l.includes("첫째 줄"));
      const second = lines.findIndex((l) => l.includes("둘째 줄"));
      const third = lines.findIndex((l) => l.includes("셋째 줄"));
      expect(first).toBeGreaterThanOrEqual(0);
      expect(second).toBe(first + 1);
      expect(third).toBe(second + 1);
      expect(out).not.toContain("둘째 줄?");
    });

    it("줄바꿈 밖의 control char 는 ? 로 바꾼다", async () => {
      withBody(`정상${ESC}[31m빨강\n덮어${"\r"}쓰기`);
      const out = await run(["calendar", "event", "get", CALENDAR_ID, EVENT_ID]);
      expect(out).toContain("정상?[31m빨강");
      expect(out).not.toContain(`정상${ESC}`);
      expect(out).toContain("덮어?쓰기");
    });

    it("본문을 자르지 않는다", async () => {
      const long = "가".repeat(300);
      withBody(long);
      const out = await run(["calendar", "event", "get", CALENDAR_ID, EVENT_ID]);
      expect(out).toContain(long);
    });

    it("본문이 비어 있으면 그 줄을 내지 않는다", async () => {
      withBody("");
      const out = await run(["calendar", "event", "get", CALENDAR_ID, EVENT_ID]);
      expect(out).not.toContain("본문");
    });

    it("body 가 없으면 그 줄을 내지 않는다", async () => {
      mocks.client.getCalendarEvent.mockResolvedValue({
        header: { isSuccessful: true, resultCode: 0, resultMessage: "" },
        result: { ...detail, body: undefined },
      });
      const out = await run(["calendar", "event", "get", CALENDAR_ID, EVENT_ID]);
      expect(out).not.toContain("본문");
    });
  });

  it("--json 은 서버 응답 result 원형을 낸다", async () => {
    const out = await run(["--json", "calendar", "event", "get", CALENDAR_ID, EVENT_ID]);
    expect(JSON.parse(out)).toEqual(detail);
  });

  it("--quiet 은 일정 id 만 낸다", async () => {
    const out = await run(["--quiet", "calendar", "event", "get", CALENDAR_ID, EVENT_ID]);
    expect(out).toBe(`${EVENT_ID}\n`);
  });
});
