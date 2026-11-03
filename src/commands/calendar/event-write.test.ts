import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";

const mocks = vi.hoisted(() => ({
  getConfigOrThrow: vi.fn(),
  startSpinner: vi.fn(),
  stopSpinner: vi.fn(),
  ensureMe: vi.fn(),
  confirm: vi.fn(),
  client: {
    getCalendars: vi.fn(),
    getCalendarEvent: vi.fn(),
    getMemberDetail: vi.fn(),
    searchMembers: vi.fn(),
    createCalendarEvent: vi.fn(),
    updateCalendarEvent: vi.fn(),
    deleteCalendarEvent: vi.fn(),
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

vi.mock("@inquirer/prompts", () => ({ confirm: mocks.confirm }));

vi.mock("../../resolvers/me.js", () => ({
  ensureMe: mocks.ensureMe,
}));

const CALENDAR_ID = "1111222233334444555";
const MEMBER_ID = "2222333344445555666";
const ME_ID = "3333444455556666777";
const EVENT_ID = "event-1";

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

const originalTz = process.env.TZ;
let stderr: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.TZ = "Asia/Seoul";
  stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  mocks.getConfigOrThrow.mockResolvedValue({
    apiKey: "test-api-key",
    baseUrl: "https://example.dooray.com",
  });
  mocks.ensureMe.mockResolvedValue({ id: ME_ID, name: "나", orgId: "org" });
  mocks.client.getCalendars.mockResolvedValue({
    result: [
      { id: CALENDAR_ID, name: "팀 캘린더", type: "project" },
      { id: "9999888877776666555", name: "공휴일", type: "subscription" },
    ],
  });
  mocks.client.getMemberDetail.mockResolvedValue({ result: { id: MEMBER_ID, name: "김철수" } });
  mocks.client.searchMembers.mockResolvedValue({
    result: [{ id: MEMBER_ID, name: "홍길동" }],
    totalCount: 1,
  });
  mocks.client.createCalendarEvent.mockResolvedValue({ result: { id: EVENT_ID } });
  mocks.client.updateCalendarEvent.mockResolvedValue({ result: null });
  mocks.client.deleteCalendarEvent.mockResolvedValue({ result: null });
  mocks.client.getCalendarEvent.mockResolvedValue({
    result: { id: EVENT_ID, subject: "주간 회의" },
  });
});

afterEach(() => {
  stderr.mockRestore();
  if (originalTz == null) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

function expectParamErrorBeforeConfig(promise: Promise<unknown>): Promise<void> {
  return expect(promise)
    .rejects.toMatchObject({ exitCode: EXIT_PARAM_ERROR })
    .then(() => {
      expect(mocks.getConfigOrThrow).not.toHaveBeenCalled();
    });
}

describe("calendar event create", () => {
  it("성공 응답에 id 가 없으면 다시 실행하기 전에 목록을 확인하라는 API 오류로 끝낸다", async () => {
    mocks.client.createCalendarEvent.mockResolvedValue({ result: null });
    await expect(
      run(["calendar", "event", "create", CALENDAR_ID, "--title", "회의", "--start", "2026-09-18"]),
    ).rejects.toMatchObject({ exitCode: 1, message: expect.stringContaining("calendar event list 로 확인") });
  });

  it("--title 이 없으면 설정을 읽기 전에 끝낸다", async () => {
    await expectParamErrorBeforeConfig(
      run(["calendar", "event", "create", CALENDAR_ID, "--start", "2026-09-18"]),
    );
  });

  it("--start 가 없으면 설정을 읽기 전에 끝낸다", async () => {
    await expectParamErrorBeforeConfig(
      run(["calendar", "event", "create", CALENDAR_ID, "--title", "휴가"]),
    );
  });

  it("날짜와 일시를 섞으면 설정을 읽기 전에 끝낸다", async () => {
    await expectParamErrorBeforeConfig(
      run([
        "calendar", "event", "create", CALENDAR_ID,
        "--title", "회의",
        "--start", "2026-09-18",
        "--end", "2026-09-18T10:00:00+09:00",
      ]),
    );
  });

  it("종일 일정을 만들고 한 줄로 알린다", async () => {
    const out = await run([
      "calendar", "event", "create", "팀 캘린더",
      "--title", "휴가",
      "--start", "2026-09-18",
      "--end", "2026-09-19",
    ]);

    expect(mocks.client.createCalendarEvent).toHaveBeenCalledWith(CALENDAR_ID, {
      subject: "휴가",
      body: { mimeType: "text/x-markdown", content: "" },
      users: {},
      startedAt: "2026-09-18+09:00",
      endedAt: "2026-09-20+09:00",
      wholeDayFlag: true,
    });
    expect(out).toBe(`일정을 만들었습니다: ${EVENT_ID} (캘린더: 팀 캘린더 (${CALENDAR_ID}))\n`);
  });

  it("--json 은 result 원형, --quiet 은 id", async () => {
    const args = [
      "calendar", "event", "create", CALENDAR_ID,
      "--title", "휴가", "--start", "2026-09-18",
    ];
    expect(JSON.parse(await run(["--json", ...args]))).toEqual({ id: EVENT_ID });
    expect(await run(["--quiet", ...args])).toBe(`${EVENT_ID}\n`);
  });

  it("--dry-run 은 이름을 해석하고 쓰기 API 없이 요청 본문을 낸다", async () => {
    const out = await run([
      "calendar", "event", "create", "팀 캘린더",
      "--title", "회의",
      "--start", "2026-09-20T14:00:00+09:00",
      "--end", "2026-09-20T15:00:00+09:00",
      "--body", "안건",
      "--location", "회의실 A",
      "--alarm", "10m",
      "--alarm", "mail:1d",
      "--private",
      "--repeat", "weekly",
      "--repeat-byday", "TH",
      "--dry-run",
      "--to", "홍길동", "me",
      "--cc", MEMBER_ID,
    ]);

    expect(mocks.client.createCalendarEvent).not.toHaveBeenCalled();
    expect(JSON.parse(out)).toEqual({
      subject: "회의",
      body: { mimeType: "text/x-markdown", content: "안건" },
      location: "회의실 A",
      users: {
        to: [
          { type: "member", member: { organizationMemberId: MEMBER_ID } },
          { type: "member", member: { organizationMemberId: ME_ID } },
        ],
        cc: [{ type: "member", member: { organizationMemberId: MEMBER_ID } }],
      },
      startedAt: "2026-09-20T14:00:00+09:00",
      endedAt: "2026-09-20T15:00:00+09:00",
      wholeDayFlag: false,
      recurrenceRule: {
        frequency: "weekly",
        interval: 1,
        byday: "TH",
        timezoneName: expect.any(String),
      },
      personalSettings: {
        alarms: [
          { action: "app", trigger: "TRIGGER:-PT10M" },
          { action: "mail", trigger: "TRIGGER:-P1D" },
        ],
        class: "private",
      },
    });
  });

  it("--dry-run 도 참석자·본문이 없을 때 실제로 보낼 빈 users·body 를 낸다", async () => {
    const out = await run([
      "calendar", "event", "create", CALENDAR_ID,
      "--title", "휴가", "--start", "2026-09-18", "--dry-run",
    ]);
    expect(mocks.client.createCalendarEvent).not.toHaveBeenCalled();
    expect(JSON.parse(out)).toMatchObject({
      users: {},
      body: { mimeType: "text/x-markdown", content: "" },
    });
  });

  it.each([[["--to", ""]], [["--to", " ", "  "]], [["--cc", " "]]])(
    "참석자 %j 처럼 빈 값만 주면 설정을 읽기 전에 끝낸다",
    async (memberArgs) => {
      await expectParamErrorBeforeConfig(
        run([
          "calendar", "event", "create", CALENDAR_ID,
          "--title", "휴가", "--start", "2026-09-18", ...memberArgs,
        ]),
      );
    },
  );

  it.each([["--json"], ["--quiet"]])(
    "--dry-run 에 전역 %s 를 주면 무시한다고 stderr 로 알린다",
    async (flag) => {
      const out = await run([
        flag, "calendar", "event", "create", CALENDAR_ID,
        "--title", "휴가", "--start", "2026-09-18", "--dry-run",
      ]);
      expect(stderr).toHaveBeenCalledWith(
        expect.stringMatching(new RegExp(`^⚠ .*--dry-run.*${flag} 을 무시`)),
      );
      expect(JSON.parse(out)).toMatchObject({ subject: "휴가" });
    },
  );

  it("--dry-run 만 주면 출력 옵션 경고를 내지 않는다", async () => {
    await run([
      "calendar", "event", "create", CALENDAR_ID,
      "--title", "휴가", "--start", "2026-09-18", "--dry-run",
    ]);
    expect(stderr).not.toHaveBeenCalledWith(expect.stringContaining("--dry-run 은"));
  });

  it("동명이인이 있으면 쓰기 API 를 부르지 않고 끝낸다", async () => {
    mocks.client.searchMembers.mockResolvedValue({
      result: [
        { id: MEMBER_ID, name: "홍길동" },
        { id: ME_ID, name: "홍길동" },
      ],
      totalCount: 2,
    });
    await expect(
      run([
        "calendar", "event", "create", CALENDAR_ID,
        "--title", "회의", "--start", "2026-09-18", "--to", "홍길동",
      ]),
    ).rejects.toMatchObject({ exitCode: EXIT_PARAM_ERROR });
    expect(mocks.client.createCalendarEvent).not.toHaveBeenCalled();
  });

  it("본문 없이 --mime-type 만 주면 stderr 로 알리고 무시한다", async () => {
    await run([
      "calendar", "event", "create", CALENDAR_ID,
      "--title", "휴가", "--start", "2026-09-18", "--mime-type", "text/html",
    ]);
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining("--mime-type 을 무시"));
    expect(mocks.client.createCalendarEvent.mock.calls[0]![1].body).toEqual({
      mimeType: "text/x-markdown",
      content: "",
    });
  });
});

describe("calendar event edit 의 개인 설정 경고", () => {
  const warnings = (): string =>
    stderr.mock.calls.map((c: unknown[]) => String(c[0])).join("");

  it("--alarm 만 주면 비공개가 풀린다고 알린다", async () => {
    await run(["calendar", "event", "edit", CALENDAR_ID, EVENT_ID, "--alarm", "30m"]);
    expect(warnings()).toContain("공개로 바뀝니다");
    expect(warnings()).not.toContain("알림이 모두 지워집니다");
  });

  it("--private 만 주면 알림이 지워진다고 알린다", async () => {
    await run(["calendar", "event", "edit", CALENDAR_ID, EVENT_ID, "--private"]);
    expect(warnings()).toContain("알림이 모두 지워집니다");
    expect(warnings()).not.toContain("공개로 바뀝니다");
  });

  it("둘 다 주면 알리지 않는다", async () => {
    await run(["calendar", "event", "edit", CALENDAR_ID, EVENT_ID, "--private", "--alarm", "10m"]);
    expect(warnings()).not.toContain("⚠");
  });

  it("알림 없이 종일 시각을 주면 알림이 지워진다고 알린다", async () => {
    await run([
      "calendar", "event", "edit", CALENDAR_ID, EVENT_ID, "--start", "2026-09-18", "--end", "2026-09-18",
    ]);
    expect(warnings()).toContain("종일로 바꾸면");
  });

  it("일반 시각이나 제목만 고치면 알리지 않는다", async () => {
    await run([
      "calendar", "event", "edit", CALENDAR_ID, EVENT_ID,
      "--title", "회의", "--start", "2026-09-18T10:00:00+09:00", "--end", "2026-09-18T11:00:00+09:00",
    ]);
    expect(warnings()).not.toContain("⚠");
  });
});

describe("calendar event edit", () => {
  it("수정할 옵션이 없으면 설정을 읽기 전에 끝낸다", async () => {
    await expectParamErrorBeforeConfig(run(["calendar", "event", "edit", CALENDAR_ID, EVENT_ID]));
  });

  it("공백뿐인 --title 은 설정을 읽기 전에 끝낸다", async () => {
    await expectParamErrorBeforeConfig(
      run(["calendar", "event", "edit", CALENDAR_ID, EVENT_ID, "--title", "   "]),
    );
  });

  it("--cc 에 빈 값만 주면 설정을 읽기 전에 끝낸다", async () => {
    await expectParamErrorBeforeConfig(
      run(["calendar", "event", "edit", CALENDAR_ID, EVENT_ID, "--cc", ""]),
    );
  });

  it("--dry-run 에 전역 --json 을 주면 무시한다고 stderr 로 알린다", async () => {
    await run([
      "--json", "calendar", "event", "edit", CALENDAR_ID, EVENT_ID, "--title", "새 제목", "--dry-run",
    ]);
    expect(stderr).toHaveBeenCalledWith(expect.stringMatching(/^⚠ .*--json 을 무시/));
    expect(mocks.client.updateCalendarEvent).not.toHaveBeenCalled();
  });

  it("--mime-type 이나 --dry-run 만으로는 수정할 항목이 아니다", async () => {
    await expectParamErrorBeforeConfig(
      run([
        "calendar", "event", "edit", CALENDAR_ID, EVENT_ID,
        "--mime-type", "text/html", "--dry-run",
      ]),
    );
  });

  it("일반 일정에서 --start 만 주면 설정을 읽기 전에 끝낸다", async () => {
    await expectParamErrorBeforeConfig(
      run([
        "calendar", "event", "edit", CALENDAR_ID, EVENT_ID,
        "--start", "2026-09-20T14:00:00+09:00",
      ]),
    );
  });

  it("빈 본문만 주면 API 를 부르지 않고 끝낸다", async () => {
    await expect(
      run(["calendar", "event", "edit", CALENDAR_ID, EVENT_ID, "--body", ""]),
    ).rejects.toMatchObject({ exitCode: EXIT_PARAM_ERROR });
    expect(mocks.client.updateCalendarEvent).not.toHaveBeenCalled();
  });

  it("준 옵션의 필드만 보낸다", async () => {
    const out = await run([
      "calendar", "event", "edit", CALENDAR_ID, EVENT_ID,
      "--title", "새 제목", "--start", "2026-10-01", "--end", "2026-10-01",
    ]);
    expect(mocks.client.updateCalendarEvent).toHaveBeenCalledWith(CALENDAR_ID, EVENT_ID, {
      subject: "새 제목",
      startedAt: "2026-10-01+09:00",
      endedAt: "2026-10-02+09:00",
      wholeDayFlag: true,
    });
    expect(out).toBe(`일정을 수정했습니다: ${EVENT_ID} (캘린더: ${CALENDAR_ID})\n`);
  });

  it("--json 은 result 원형(null), --quiet 은 event-id", async () => {
    const args = ["calendar", "event", "edit", CALENDAR_ID, EVENT_ID, "--location", "회의실 B"];
    expect(JSON.parse(await run(["--json", ...args]))).toBeNull();
    expect(await run(["--quiet", ...args])).toBe(`${EVENT_ID}\n`);
  });

  it("반복 회차 id 는 설정을 읽기 전에 원본 id 를 알려주고 거부한다", async () => {
    const original = "1234567890123456789";
    const promise = run([
      "calendar", "event", "edit", CALENDAR_ID, `${original}-20261109T000000Z`, "--title", "x",
    ]);
    await expect(promise).rejects.toMatchObject({
      exitCode: EXIT_PARAM_ERROR,
      message: expect.stringMatching(new RegExp(`반복 전체.*원본 id\\(${original}\\)`, "s")),
    });
    expect(mocks.getConfigOrThrow).not.toHaveBeenCalled();
    expect(mocks.client.updateCalendarEvent).not.toHaveBeenCalled();
  });

  it("--cc 만 주면 상세를 조회해 기존 참석자(emailUser 포함)를 함께 보낸다", async () => {
    mocks.client.getCalendarEvent.mockResolvedValue({
      result: {
        id: EVENT_ID,
        users: {
          to: [
            { type: "member", member: { organizationMemberId: ME_ID, name: "나" } },
            { type: "emailUser", emailUser: { emailAddress: "user@example.com", name: "김철수" } },
          ],
          cc: [],
        },
      },
    });
    await run(["calendar", "event", "edit", CALENDAR_ID, EVENT_ID, "--cc", MEMBER_ID]);
    expect(mocks.client.getCalendarEvent).toHaveBeenCalledWith(CALENDAR_ID, EVENT_ID);
    expect(mocks.client.updateCalendarEvent).toHaveBeenCalledWith(CALENDAR_ID, EVENT_ID, {
      users: {
        to: [
          { type: "member", member: { organizationMemberId: ME_ID } },
          { type: "emailUser", emailUser: { emailAddress: "user@example.com", name: "김철수" } },
        ],
        cc: [{ type: "member", member: { organizationMemberId: MEMBER_ID } }],
      },
    });
  });

  it("--dry-run 에서도 같은 조회로 실제 보낼 users 를 낸다", async () => {
    mocks.client.getCalendarEvent.mockResolvedValue({
      result: { id: EVENT_ID, users: { cc: [{ type: "member", member: { organizationMemberId: ME_ID } }] } },
    });
    const out = await run([
      "calendar", "event", "edit", CALENDAR_ID, EVENT_ID, "--to", MEMBER_ID, "--dry-run",
    ]);
    expect(mocks.client.updateCalendarEvent).not.toHaveBeenCalled();
    expect(JSON.parse(out).users).toEqual({
      to: [{ type: "member", member: { organizationMemberId: MEMBER_ID } }],
      cc: [{ type: "member", member: { organizationMemberId: ME_ID } }],
    });
  });

  it("--to 와 --cc 를 둘 다 주면 기존 값을 조회하지 않는다", async () => {
    await run([
      "calendar", "event", "edit", CALENDAR_ID, EVENT_ID, "--cc", ME_ID, "--to", MEMBER_ID,
    ]);
    expect(mocks.client.getCalendarEvent).not.toHaveBeenCalled();
    expect(mocks.client.updateCalendarEvent.mock.calls[0]![2].users).toEqual({
      to: [{ type: "member", member: { organizationMemberId: MEMBER_ID } }],
      cc: [{ type: "member", member: { organizationMemberId: ME_ID } }],
    });
  });

  it("한쪽 참석자만 줬는데 기존 참석자를 읽지 못하면 빈 목록으로 채우지 않고 멈춘다", async () => {
    mocks.client.getCalendarEvent.mockResolvedValue({ result: null });
    await expect(
      run(["calendar", "event", "edit", CALENDAR_ID, EVENT_ID, "--cc", MEMBER_ID]),
    ).rejects.toMatchObject({ exitCode: EXIT_PARAM_ERROR, message: expect.stringContaining("기존 참석자를 읽지 못해") });
    expect(mocks.client.updateCalendarEvent).not.toHaveBeenCalled();
  });

  it("--repeat 없이 부속 옵션만 주면 설정을 읽기 전에 끝낸다", async () => {
    await expectParamErrorBeforeConfig(
      run(["calendar", "event", "edit", CALENDAR_ID, EVENT_ID, "--repeat-interval", "2"]),
    );
  });

  it("종일 시각에 --end 가 없으면 설정을 읽기 전에 끝낸다", async () => {
    await expectParamErrorBeforeConfig(
      run(["calendar", "event", "edit", CALENDAR_ID, EVENT_ID, "--start", "2026-09-18"]),
    );
  });
});

describe("calendar event edit 의 반복 규칙 병합", () => {
  const warnings = (): string =>
    stderr.mock.calls.map((c: unknown[]) => String(c[0])).join("");

  // 실측 응답 형태: 쓰기 요청에 없는 필드도 오고 없는 값은 null 이다.
  const existingRule = {
    frequency: "monthly",
    interval: 2,
    startedAt: "2026-11-19T10:00:00+09:00",
    endedAt: "2026-11-19T10:30:00+09:00",
    until: "2027-06-30T23:59:59+09:00",
    count: null,
    byday: "TH",
    bymonthday: "18,19,20,21,22,23,24",
    bymonth: null,
    bysetpos: null,
    wkst: null,
    timezoneName: "Asia/Seoul",
  };

  function withExistingRule(rule: Record<string, unknown> | null): void {
    mocks.client.getCalendarEvent.mockResolvedValue({ result: { id: EVENT_ID, recurrenceRule: rule } });
  }

  it("주기가 같으면 주지 않은 간격·요일·날짜를 기존 규칙에서 채운다", async () => {
    withExistingRule(existingRule);
    await run([
      "calendar", "event", "edit", CALENDAR_ID, EVENT_ID, "--repeat", "monthly", "--repeat-until", "2027-08-31",
    ]);
    expect(mocks.client.getCalendarEvent).toHaveBeenCalledWith(CALENDAR_ID, EVENT_ID);
    expect(mocks.client.updateCalendarEvent.mock.calls[0]![2].recurrenceRule).toEqual({
      frequency: "monthly",
      interval: 2,
      timezoneName: "Asia/Seoul",
      until: "2027-08-31T23:59:59+09:00",
      byday: "TH",
      bymonthday: "18,19,20,21,22,23,24",
    });
    expect(warnings()).not.toContain("반복 규칙");
  });

  // 장비는 Asia/Seoul 로 고정돼 있다. 일정의 시간대가 다르면 날짜만 준 종료일을 일정의 시간대로 넓힌다.
  it("날짜만 준 --repeat-until 은 일정의 시간대 기준 23:59:59 로 넓힌다", async () => {
    withExistingRule({ ...existingRule, timezoneName: "America/New_York" });
    await run([
      "calendar", "event", "edit", CALENDAR_ID, EVENT_ID, "--repeat", "monthly", "--repeat-until", "2027-08-31",
    ]);
    const rule = mocks.client.updateCalendarEvent.mock.calls[0]![2].recurrenceRule;
    expect(rule.timezoneName).toBe("America/New_York");
    expect(rule.until).toBe("2027-08-31T23:59:59-04:00");
    expect(warnings()).not.toContain("읽지 못해");
  });

  it("일정의 시간대 이름을 읽지 못하면 장비 시간대로 넓힌 값을 그대로 보낸다", async () => {
    withExistingRule({ ...existingRule, timezoneName: "Not/AZone" });
    await run([
      "calendar", "event", "edit", CALENDAR_ID, EVENT_ID, "--repeat", "monthly", "--repeat-until", "2027-08-31",
    ]);
    expect(mocks.client.updateCalendarEvent.mock.calls[0]![2].recurrenceRule.until).toBe("2027-08-31T23:59:59+09:00");
    expect(warnings()).toContain("일정의 시간대 Not/AZone 를 읽지 못해");
  });

  it("시각까지 준 --repeat-until 은 시간대를 바꾸지 않는다", async () => {
    withExistingRule({ ...existingRule, timezoneName: "America/New_York" });
    await run([
      "calendar", "event", "edit", CALENDAR_ID, EVENT_ID, "--repeat", "monthly",
      "--repeat-until", "2027-08-31T18:00:00+09:00",
    ]);
    expect(mocks.client.updateCalendarEvent.mock.calls[0]![2].recurrenceRule.until).toBe("2027-08-31T18:00:00+09:00");
  });

  it("--repeat-until 을 주지 않으면 기존 종료일을 유지한다", async () => {
    withExistingRule(existingRule);
    await run([
      "calendar", "event", "edit", CALENDAR_ID, EVENT_ID, "--repeat", "monthly", "--repeat-interval", "3",
    ]);
    const rule = mocks.client.updateCalendarEvent.mock.calls[0]![2].recurrenceRule;
    expect(rule.interval).toBe(3);
    expect(rule.until).toBe("2027-06-30T23:59:59+09:00");
  });

  it("주기를 바꾸면 종료일 밖의 세부 필드는 채우지 않고 지워질 필드를 알린다", async () => {
    withExistingRule(existingRule);
    await run(["calendar", "event", "edit", CALENDAR_ID, EVENT_ID, "--repeat", "weekly"]);
    expect(mocks.client.updateCalendarEvent.mock.calls[0]![2].recurrenceRule).toEqual({
      frequency: "weekly",
      interval: 1,
      timezoneName: "Asia/Seoul",
      until: "2027-06-30T23:59:59+09:00",
    });
    expect(warnings()).toContain("interval, byday, bymonthday 이(가) 지워집니다");
    expect(warnings()).not.toContain("until");
  });

  // 실제 수정은 경고가 수정 뒤에 나온다. 경고만 보고 지워진 값을 되살릴 수 있어야 한다.
  it("지워질 필드의 원래 값을 되살릴 옵션으로 함께 알린다", async () => {
    withExistingRule(existingRule);
    await run(["calendar", "event", "edit", CALENDAR_ID, EVENT_ID, "--repeat", "weekly"]);
    expect(warnings()).toContain(
      "지금 값을 유지하려면 이 옵션으로 다시 실행합니다: " +
        "--repeat weekly --repeat-interval 2 --repeat-byday TH --repeat-bymonthday 18,19,20,21,22,23,24",
    );
  });

  // 경고가 안내한 옵션을 그대로 다시 넣으면 서버 값 형식 그대로 받아들여 아무것도 지워지지 않아야 한다.
  it("경고가 안내한 옵션으로 다시 실행하면 그 값을 그대로 보낸다", async () => {
    withExistingRule({ ...existingRule, frequency: "weekly", byday: "1 MO" });
    await run([
      "calendar", "event", "edit", CALENDAR_ID, EVENT_ID, "--repeat", "monthly",
      "--repeat-interval", "2", "--repeat-byday", "1 MO", "--repeat-bymonthday", "18,19,20,21,22,23,24",
    ]);
    expect(mocks.client.updateCalendarEvent.mock.calls[0]![2].recurrenceRule).toMatchObject({
      frequency: "monthly",
      interval: 2,
      byday: "1 MO",
      bymonthday: "18,19,20,21,22,23,24",
    });
    expect(warnings()).not.toContain("지워집니다");
  });

  it("빈 문자열인 세부 필드는 지워질 필드로 알리지 않는다", async () => {
    withExistingRule({ ...existingRule, frequency: "weekly", interval: 1, byday: "", bymonthday: "" });
    await run(["calendar", "event", "edit", CALENDAR_ID, EVENT_ID, "--repeat", "monthly"]);
    expect(warnings()).not.toContain("지워집니다");
    expect(warnings()).not.toContain("--repeat-byday");
  });

  it("--dry-run 도 API 를 부르기 전에 원래 값과 함께 알린다", async () => {
    withExistingRule(existingRule);
    await run(["calendar", "event", "edit", CALENDAR_ID, EVENT_ID, "--repeat", "weekly", "--dry-run"]);
    expect(mocks.client.updateCalendarEvent).not.toHaveBeenCalled();
    expect(warnings()).toContain("--repeat-byday TH");
  });

  it("주기를 바꾸며 --repeat-until 을 주면 준 종료일을 쓴다", async () => {
    withExistingRule(existingRule);
    await run([
      "calendar", "event", "edit", CALENDAR_ID, EVENT_ID, "--repeat", "weekly", "--repeat-until", "2027-08-31",
    ]);
    expect(mocks.client.updateCalendarEvent.mock.calls[0]![2].recurrenceRule.until).toBe("2027-08-31T23:59:59+09:00");
  });

  it("CLI 가 다루지 않는 필드가 있으면 주기가 같아도 지워진다고 알린다", async () => {
    withExistingRule({ ...existingRule, until: null, count: 10 });
    await run(["calendar", "event", "edit", CALENDAR_ID, EVENT_ID, "--repeat", "monthly"]);
    expect(warnings()).toContain("count 이(가) 지워집니다");
    expect(warnings()).toContain("count=10 은(는) CLI 로 다시 줄 수 없어 웹에서 설정합니다");
    expect(warnings()).not.toContain("지금 값을 유지하려면");
  });

  it("셸이 다르게 읽을 글자가 있는 값은 작은따옴표로 감싸고 제어 문자는 지운다", async () => {
    withExistingRule({ ...existingRule, until: null, wkst: "MO it's\u001b[31m" });
    await run(["calendar", "event", "edit", CALENDAR_ID, EVENT_ID, "--repeat", "monthly"]);
    expect(warnings()).toContain("wkst='MO it'\\''s?[31m' 은(는)");
  });

  it("--repeat 으로 상세를 읽지 못하면 수정하지 않는다", async () => {
    mocks.client.getCalendarEvent.mockRejectedValue(new Error("network"));
    await expect(
      run(["calendar", "event", "edit", CALENDAR_ID, EVENT_ID, "--repeat", "weekly"]),
    ).rejects.toThrow("network");
    expect(mocks.client.updateCalendarEvent).not.toHaveBeenCalled();
  });

  it("반복이 아니던 일정은 준 규칙 그대로 보낸다", async () => {
    withExistingRule(null);
    await run(["calendar", "event", "edit", CALENDAR_ID, EVENT_ID, "--repeat", "monthly"]);
    expect(mocks.client.updateCalendarEvent.mock.calls[0]![2].recurrenceRule).toEqual({
      frequency: "monthly",
      interval: 1,
      timezoneName: "Asia/Seoul",
    });
    expect(warnings()).not.toContain("반복 규칙");
  });

  it("--dry-run 에서도 채운 규칙을 보인다", async () => {
    withExistingRule(existingRule);
    const out = await run([
      "calendar", "event", "edit", CALENDAR_ID, EVENT_ID, "--repeat", "monthly", "--dry-run",
    ]);
    expect(mocks.client.updateCalendarEvent).not.toHaveBeenCalled();
    expect(JSON.parse(out).recurrenceRule.byday).toBe("TH");
  });

  it("기존 규칙의 시간대를 유지한다", async () => {
    withExistingRule({ ...existingRule, timezoneName: "America/New_York" });
    await run(["calendar", "event", "edit", CALENDAR_ID, EVENT_ID, "--repeat", "monthly"]);
    expect(mocks.client.updateCalendarEvent.mock.calls[0]![2].recurrenceRule.timezoneName).toBe(
      "America/New_York",
    );
  });

  it("응답의 주기 표기가 대문자여도 같은 주기로 보고 채운다", async () => {
    withExistingRule({ ...existingRule, frequency: "MONTHLY" });
    await run(["calendar", "event", "edit", CALENDAR_ID, EVENT_ID, "--repeat", "monthly"]);
    expect(mocks.client.updateCalendarEvent.mock.calls[0]![2].recurrenceRule.byday).toBe("TH");
    expect(warnings()).not.toContain("반복 규칙");
  });

  it("지워질 필드 경고는 스피너를 멈춘 뒤에 낸다", async () => {
    withExistingRule(existingRule);
    await run(["calendar", "event", "edit", CALENDAR_ID, EVENT_ID, "--repeat", "weekly"]);
    const warnIndex = stderr.mock.calls.findIndex((c: unknown[]) => String(c[0]).includes("반복 규칙"));
    expect(warnIndex).toBeGreaterThanOrEqual(0);
    const warnOrder = stderr.mock.invocationCallOrder[warnIndex]!;
    const lastStop = Math.max(...mocks.stopSpinner.mock.invocationCallOrder);
    expect(warnOrder).toBeGreaterThan(lastStop);
  });

  it("--repeat 이 없으면 반복 규칙 때문에 상세를 조회하지 않는다", async () => {
    await run(["calendar", "event", "edit", CALENDAR_ID, EVENT_ID, "--title", "x"]);
    expect(mocks.client.getCalendarEvent).not.toHaveBeenCalled();
  });
});

describe("calendar event delete", () => {
  it.each([
    [[], "this"],
    [["--scope", "from-this"], "wholeFromThis"],
    [["--scope", "all"], "whole"],
  ])("%j 는 deleteType %s 로 보낸다", async (scopeArgs, deleteType) => {
    const instanceId = `${EVENT_ID}-20240228T013000Z`;
    const out = await run([
      "calendar", "event", "delete", CALENDAR_ID, instanceId, "-y", ...scopeArgs,
    ]);
    expect(mocks.client.deleteCalendarEvent).toHaveBeenCalledWith(
      CALENDAR_ID,
      instanceId,
      deleteType,
    );
    expect(out).toBe(`일정(${instanceId})을 삭제했습니다.\n`);
  });

  it("이름으로 준 캘린더를 해석한다", async () => {
    await run(["calendar", "event", "delete", "팀 캘린더", EVENT_ID, "--yes"]);
    expect(mocks.client.deleteCalendarEvent).toHaveBeenCalledWith(CALENDAR_ID, EVENT_ID, "this");
  });

  describe("반복 일정의 원본 id", () => {
    beforeEach(() => {
      mocks.client.getCalendarEvent.mockResolvedValue({
        result: { id: EVENT_ID, subject: "주간 회의", recurrenceRule: { frequency: "weekly", interval: 1 } },
      });
    });

    it("--scope 를 생략하면 반복 전체가 지워지므로 API 를 부르지 않고 거부한다", async () => {
      await expect(
        run(["calendar", "event", "delete", CALENDAR_ID, EVENT_ID, "-y"]),
      ).rejects.toMatchObject({
        exitCode: EXIT_PARAM_ERROR,
        message: expect.stringContaining("--scope all"),
      });
      expect(mocks.client.getCalendarEvent).toHaveBeenCalledWith(CALENDAR_ID, EVENT_ID);
      expect(mocks.client.deleteCalendarEvent).not.toHaveBeenCalled();
    });

    it("--scope all 은 조회하지 않고 지운다", async () => {
      await run(["calendar", "event", "delete", CALENDAR_ID, EVENT_ID, "-y", "--scope", "all"]);
      expect(mocks.client.getCalendarEvent).not.toHaveBeenCalled();
      expect(mocks.client.deleteCalendarEvent).toHaveBeenCalledWith(CALENDAR_ID, EVENT_ID, "whole");
    });

    describe("터미널에서 확인을 물을 때", () => {
      const ttyBefore = process.stdin.isTTY;
      beforeEach(() => {
        Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
      });
      afterEach(() => {
        Object.defineProperty(process.stdin, "isTTY", { value: ttyBefore, configurable: true });
      });

      it("확인 질문을 띄우기 전에 거부한다", async () => {
        await expect(run(["calendar", "event", "delete", CALENDAR_ID, EVENT_ID])).rejects.toMatchObject({
          exitCode: EXIT_PARAM_ERROR,
        });
        expect(mocks.confirm).not.toHaveBeenCalled();
        expect(mocks.client.deleteCalendarEvent).not.toHaveBeenCalled();
      });

      it("반복이 아닌 일정은 확인을 물은 뒤 지운다", async () => {
        mocks.client.getCalendarEvent.mockResolvedValue({ result: { id: EVENT_ID, subject: "회의" } });
        mocks.confirm.mockResolvedValue(true);
        await run(["calendar", "event", "delete", CALENDAR_ID, EVENT_ID]);
        expect(mocks.confirm).toHaveBeenCalledTimes(1);
        expect(mocks.client.getCalendarEvent).toHaveBeenCalledTimes(1);
        expect(mocks.client.deleteCalendarEvent).toHaveBeenCalledWith(CALENDAR_ID, EVENT_ID, "this");
      });
    });

    it("상세를 읽지 못하면 반복 여부를 모르므로 지우지 않는다", async () => {
      mocks.client.getCalendarEvent.mockRejectedValue(new Error("network"));
      await expect(run(["calendar", "event", "delete", CALENDAR_ID, EVENT_ID, "-y"])).rejects.toThrow("network");
      expect(mocks.client.deleteCalendarEvent).not.toHaveBeenCalled();
    });
  });

  it("반복이 아닌 일정의 원본 id 는 기본 범위로 지운다", async () => {
    await run(["calendar", "event", "delete", CALENDAR_ID, EVENT_ID, "-y"]);
    expect(mocks.client.getCalendarEvent).toHaveBeenCalledTimes(1);
    expect(mocks.client.deleteCalendarEvent).toHaveBeenCalledWith(CALENDAR_ID, EVENT_ID, "this");
  });

  it("회차 id 는 반복 여부를 조회하지 않는다", async () => {
    const instanceId = `${EVENT_ID}-20240228T013000Z`;
    await run(["calendar", "event", "delete", CALENDAR_ID, instanceId, "-y"]);
    expect(mocks.client.getCalendarEvent).not.toHaveBeenCalled();
  });

  it("모르는 --scope 는 거부한다", async () => {
    await expect(
      run(["calendar", "event", "delete", CALENDAR_ID, EVENT_ID, "-y", "--scope", "future"]),
    ).rejects.toThrow();
    expect(mocks.client.deleteCalendarEvent).not.toHaveBeenCalled();
  });
});
