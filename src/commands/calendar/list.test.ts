import { beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import type { Calendar } from "@/api/calendar/types.js";

const mocks = vi.hoisted(() => ({
  getConfigOrThrow: vi.fn(),
  startSpinner: vi.fn(),
  stopSpinner: vi.fn(),
  client: {
    getCalendars: vi.fn(),
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

const calendars: Calendar[] = [
  { id: "cal-1", name: "내 캘린더", type: "private" },
  { id: "cal-2", name: "팀 캘린더", type: "subscription" },
];

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
  mocks.client.getCalendars.mockResolvedValue({
    header: { isSuccessful: true, resultCode: 0, resultMessage: "" },
    result: calendars,
    totalCount: 2,
  });
});

describe("calendar list", () => {
  it("표는 이름·ID·종류를 낸다", async () => {
    const out = await run(["calendar", "list"]);
    expect(out).toContain("내 캘린더");
    expect(out).toContain("cal-1");
    expect(out).toContain("subscription");
  });

  it("--json 은 서버 응답 result 원형을 낸다", async () => {
    const out = await run(["--json", "calendar", "list"]);
    expect(JSON.parse(out)).toEqual(calendars);
  });

  it("--quiet 은 캘린더 id 만 낸다", async () => {
    const out = await run(["--quiet", "calendar", "list"]);
    expect(out.trim().split("\n")).toEqual(["cal-1", "cal-2"]);
  });

  it("이름의 control char 를 출력 직전에 없앤다", async () => {
    mocks.client.getCalendars.mockResolvedValue({
      header: { isSuccessful: true, resultCode: 0, resultMessage: "" },
      result: [{ id: "cal-9", name: `정상${ESC}[31m빨강`, type: "private" }],
    });
    const out = await run(["calendar", "list"]);
    expect(out).toContain("정상?[31m빨강");
    expect(out).not.toContain(`정상${ESC}`);
  });

  describe("결과가 0건", () => {
    beforeEach(() => {
      mocks.client.getCalendars.mockResolvedValue({
        header: { isSuccessful: true, resultCode: 0, resultMessage: "" },
        result: [],
        totalCount: 0,
      });
    });

    it("표 모드는 빈 표 대신 안내를 낸다", async () => {
      expect(await run(["calendar", "list"])).toBe("캘린더가 없습니다.\n");
    });

    it("--quiet 은 아무것도 출력하지 않는다", async () => {
      expect(await run(["--quiet", "calendar", "list"])).toBe("");
    });

    it("--json 은 빈 배열을 낸다", async () => {
      expect(JSON.parse(await run(["--json", "calendar", "list"]))).toEqual([]);
    });
  });
});
