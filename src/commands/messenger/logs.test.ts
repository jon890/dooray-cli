import { beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import type { MessengerLog } from "../../api/types.js";

const mocks = vi.hoisted(() => ({
  getConfigOrThrow: vi.fn(),
  resolveMessengerChannel: vi.fn(),
  startSpinner: vi.fn(),
  stopSpinner: vi.fn(),
  client: {
    getChannelLogs: vi.fn(),
    getMemberDetail: vi.fn(),
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

vi.mock("../../resolvers/messenger-channel.js", () => ({
  resolveMessengerChannel: mocks.resolveMessengerChannel,
}));

vi.mock("../../utils/spinner.js", () => ({
  startSpinner: mocks.startSpinner,
  stopSpinner: mocks.stopSpinner,
}));

// ANSI escape 시작 바이트. 리터럴로 두면 편집기에서 보이지 않아 escape 표기로 쓴다.
const ESC = "\u001b";

const CHANNEL_ID = "1234567890123456789";
const ALICE_ID = "1111222233334444555";
const BOB_ID = "2222333344445555666";

// API 는 seq 내림차순(최신이 앞)으로 준다.
const logs: MessengerLog[] = [
  {
    id: "log-3",
    seq: 3,
    sender: { type: "member", member: { organizationMemberId: ALICE_ID } },
    sentAt: "2026-09-18T11:40:11+09:00",
    text: "세 번째",
  },
  {
    id: "log-2",
    seq: 2,
    sender: { type: "member", member: { organizationMemberId: BOB_ID } },
    sentAt: "2026-09-18T11:39:11+09:00",
    text: "두 번째",
  },
  {
    id: "log-1",
    seq: 1,
    sender: { type: "member", member: { organizationMemberId: ALICE_ID } },
    sentAt: "2026-09-18T11:38:11+09:00",
    text: "첫 번째",
  },
];

function exitOverrideAll(cmd: Command): void {
  cmd.exitOverride();
  cmd.configureOutput({ writeErr: () => {} });
  cmd.commands.forEach(exitOverrideAll);
}

async function createCommandTree(): Promise<Command> {
  vi.resetModules();
  const { messengerLogsCommand } = await import("./logs.js");
  const program = new Command()
    .name("dooray")
    .option("--json", "JSON 형식으로 출력")
    .option("--quiet", "ID만 출력")
    .option("--no-color", "색상 비활성화");
  const messengerCommand = new Command("messenger").description("메신저 관련 명령");
  messengerCommand.addCommand(messengerLogsCommand);
  program.addCommand(messengerCommand);
  return program;
}

let lastStderr = "";

async function run(argv: string[]): Promise<string> {
  const program = await createCommandTree();
  exitOverrideAll(program);
  const chunks: string[] = [];
  const errChunks: string[] = [];
  lastStderr = "";
  const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    chunks.push(String(chunk));
    return true;
  });
  const errSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    errChunks.push(String(chunk));
    return true;
  });
  try {
    await program.parseAsync(["node", "dooray", ...argv]);
  } finally {
    spy.mockRestore();
    errSpy.mockRestore();
    lastStderr = errChunks.join("");
  }
  return chunks.join("");
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getConfigOrThrow.mockResolvedValue({
    apiKey: "test-api-key",
    baseUrl: "https://example.dooray.com",
  });
  mocks.resolveMessengerChannel.mockResolvedValue(CHANNEL_ID);
  mocks.client.getChannelLogs.mockResolvedValue({
    header: { isSuccessful: true, resultCode: 0, resultMessage: "" },
    result: logs,
    hasMore: true,
  });
  mocks.client.getMemberDetail.mockImplementation(async (id: string) => ({
    header: { isSuccessful: true, resultCode: 0, resultMessage: "" },
    result: { id, name: id === ALICE_ID ? "앨리스" : "밥" },
  }));
});

describe("messenger logs", () => {
  it("기본 개수 20을 size 로 전달한다", async () => {
    await run(["messenger", "logs", CHANNEL_ID]);
    expect(mocks.client.getChannelLogs).toHaveBeenCalledWith(CHANNEL_ID, 20);
  });

  it("-n 으로 준 개수를 size 로 전달한다", async () => {
    await run(["messenger", "logs", "대화방이름", "-n", "50"]);
    expect(mocks.resolveMessengerChannel).toHaveBeenCalledWith(mocks.client, "대화방이름");
    expect(mocks.client.getChannelLogs).toHaveBeenCalledWith(CHANNEL_ID, 50);
  });

  it("1000 초과는 거부하고 API 를 부르지 않는다", async () => {
    await expect(run(["messenger", "logs", CHANNEL_ID, "-n", "1001"])).rejects.toThrow(
      /최대 1000/,
    );
    expect(mocks.client.getChannelLogs).not.toHaveBeenCalled();
  });

  it("1000 은 허용한다", async () => {
    await run(["messenger", "logs", CHANNEL_ID, "-n", "1000"]);
    expect(mocks.client.getChannelLogs).toHaveBeenCalledWith(CHANNEL_ID, 1000);
  });

  it("숫자가 아닌 개수는 거부한다", async () => {
    await expect(run(["messenger", "logs", CHANNEL_ID, "-n", "abc"])).rejects.toThrow(
      /양의 정수/,
    );
    expect(mocks.client.getChannelLogs).not.toHaveBeenCalled();
  });

  it("표는 시간 오름차순(최신이 아래)으로 출력한다", async () => {
    const out = await run(["messenger", "logs", CHANNEL_ID]);
    expect(out.indexOf("첫 번째")).toBeLessThan(out.indexOf("두 번째"));
    expect(out.indexOf("두 번째")).toBeLessThan(out.indexOf("세 번째"));
    expect(out).toContain("2026-09-18 11:38");
  });

  it("같은 발신자를 반복 조회하지 않는다", async () => {
    await run(["messenger", "logs", CHANNEL_ID]);
    expect(mocks.client.getMemberDetail).toHaveBeenCalledTimes(2);
    expect(mocks.client.getMemberDetail.mock.calls.map((c) => c[0]).sort()).toEqual(
      [ALICE_ID, BOB_ID].sort(),
    );
  });

  it("이름 조회에 실패하면 id 로 대체하고 명령은 계속한다", async () => {
    mocks.client.getMemberDetail.mockRejectedValue(new Error("404"));
    const out = await run(["messenger", "logs", CHANNEL_ID]);
    expect(out).toContain(ALICE_ID);
    expect(out).toContain("첫 번째");
  });

  it("sender.type 이 member 가 아니면 type 을 보낸이로 쓴다", async () => {
    mocks.client.getChannelLogs.mockResolvedValue({
      header: { isSuccessful: true, resultCode: 0, resultMessage: "" },
      result: [{ id: "log-9", sender: { type: "bot" }, sentAt: "2026-09-18T11:38:11+09:00", text: "봇 메시지" }],
    });
    const out = await run(["messenger", "logs", CHANNEL_ID]);
    expect(out).toContain("bot");
    expect(mocks.client.getMemberDetail).not.toHaveBeenCalled();
  });

  it("--json 은 서버 응답 result 원형을 낸다", async () => {
    const out = await run(["--json", "messenger", "logs", CHANNEL_ID]);
    expect(JSON.parse(out)).toEqual(logs);
    expect(mocks.client.getMemberDetail).not.toHaveBeenCalled();
  });

  it("--quiet 은 로그 id 만 시간 오름차순으로 낸다", async () => {
    const out = await run(["--quiet", "messenger", "logs", CHANNEL_ID]);
    expect(out.trim().split("\n")).toEqual(["log-1", "log-2", "log-3"]);
  });

  it("이름 해석이 끝난 뒤에 완료 표시를 낸다", async () => {
    await run(["messenger", "logs", CHANNEL_ID]);
    const lastLookup = Math.max(
      ...mocks.client.getMemberDetail.mock.invocationCallOrder,
    );
    expect(mocks.stopSpinner.mock.invocationCallOrder[0]).toBeGreaterThan(lastLookup);
  });

  it("본문의 control char 를 출력 직전에 없앤다", async () => {
    mocks.client.getChannelLogs.mockResolvedValue({
      header: { isSuccessful: true, resultCode: 0, resultMessage: "" },
      result: [
        {
          id: "log-9",
          sender: { type: "member", member: { organizationMemberId: ALICE_ID } },
          sentAt: "2026-09-18T11:38:11+09:00",
          text: `정상${ESC}[31m빨강`,
        },
      ],
    });
    const out = await run(["messenger", "logs", CHANNEL_ID]);
    // cli-table3 이 테두리에 쓰는 escape 와 섞이므로, 주입한 escape 가 ? 로 바뀌었는지로 판정한다.
    expect(out).toContain("정상?[31m빨강");
    expect(out).not.toContain(`정상${ESC}`);
  });

  it("발신자 이름의 control char 도 없앤다", async () => {
    mocks.client.getMemberDetail.mockResolvedValue({
      header: { isSuccessful: true, resultCode: 0, resultMessage: "" },
      result: { id: ALICE_ID, name: `앨${ESC}[31m리스` },
    });
    const out = await run(["messenger", "logs", CHANNEL_ID]);
    expect(out).toContain("앨?[31m리스");
    expect(out).not.toContain(`앨${ESC}`);
  });

  describe("hasMore", () => {
    it("true 면 stderr 로 알린다", async () => {
      await run(["messenger", "logs", CHANNEL_ID]);
      expect(lastStderr).toContain("오래된 메시지가 더 있지만");
    });

    it("--json 과 --quiet 에서도 stderr 안내가 나가고 stdout 은 깨끗하다", async () => {
      const jsonOut = await run(["--json", "messenger", "logs", CHANNEL_ID]);
      expect(lastStderr).toContain("오래된 메시지가 더 있지만");
      expect(() => JSON.parse(jsonOut)).not.toThrow();

      const quietOut = await run(["--quiet", "messenger", "logs", CHANNEL_ID]);
      expect(lastStderr).toContain("오래된 메시지가 더 있지만");
      expect(quietOut.trim().split("\n")).toEqual(["log-1", "log-2", "log-3"]);
    });

    it("false 거나 없으면 아무 안내도 하지 않는다", async () => {
      mocks.client.getChannelLogs.mockResolvedValue({
        header: { isSuccessful: true, resultCode: 0, resultMessage: "" },
        result: logs,
        hasMore: false,
      });
      await run(["messenger", "logs", CHANNEL_ID]);
      expect(lastStderr).toBe("");
    });
  });

  describe("결과가 0건", () => {
    beforeEach(() => {
      mocks.client.getChannelLogs.mockResolvedValue({
        header: { isSuccessful: true, resultCode: 0, resultMessage: "" },
        result: [],
        hasMore: false,
      });
    });

    it("표 모드는 빈 표 대신 안내를 낸다", async () => {
      const out = await run(["messenger", "logs", CHANNEL_ID]);
      expect(out).toBe("메시지가 없습니다.\n");
      expect(out).not.toContain("보낸이");
    });

    it("--quiet 은 아무것도 출력하지 않는다", async () => {
      const out = await run(["--quiet", "messenger", "logs", CHANNEL_ID]);
      expect(out).toBe("");
    });

    it("--json 은 빈 배열을 낸다", async () => {
      const out = await run(["--json", "messenger", "logs", CHANNEL_ID]);
      expect(JSON.parse(out)).toEqual([]);
    });
  });
  describe("파일과 스레드", () => {
    const FILE_ID = "3333444455556666777";
    const THREAD_ID = "4444555566667777888";
    const base = {
      sender: { type: "member", member: { organizationMemberId: ALICE_ID } },
      sentAt: "2026-09-18T11:38:11+09:00",
    };

    function stubLogs(result: MessengerLog[]): void {
      mocks.client.getChannelLogs.mockResolvedValue({
        header: { isSuccessful: true, resultCode: 0, resultMessage: "" },
        result,
      });
    }

    it("파일 메시지는 내용에 파일명과 크기를, 참조에 파일 id 를 보여준다", async () => {
      stubLogs([
        {
          id: "log-f",
          ...base,
          type: "FILE",
          text: "보고서.pdf",
          file: { id: FILE_ID, fileName: "보고서.pdf", fileSize: 2048, mimeType: "application/pdf" },
        },
      ]);
      const out = await run(["messenger", "logs", CHANNEL_ID]);
      expect(out).toContain("참조");
      expect(out).toContain("[파일] 보고서.pdf (2.0KB)");
      // text 가 파일명과 같으면 뒤에 다시 붙이지 않는다
      expect(out).not.toContain("(2.0KB) 보고서.pdf");
      expect(out).toContain(`파일 ${FILE_ID}`);
    });

    it("REPLY 에 붙은 파일은 파일 표시 뒤에 본문을 잇는다", async () => {
      stubLogs([
        {
          id: "log-r",
          ...base,
          type: "REPLY",
          text: "이거 보세요",
          file: { id: FILE_ID, fileName: "a.png", fileSize: 10 },
        },
      ]);
      const out = await run(["messenger", "logs", CHANNEL_ID]);
      expect(out).toContain("[파일] a.png (10B) 이거 보세요");
      expect(out).toContain(`파일 ${FILE_ID}`);
    });

    it("파일명이 길어도 크기와 REPLY 본문은 잘리지 않는다", async () => {
      const longName = "가".repeat(40) + ".xlsx";
      stubLogs([
        {
          id: "log-l",
          ...base,
          type: "REPLY",
          text: "확인",
          file: { id: FILE_ID, fileName: longName, fileSize: 2048 },
        },
      ]);
      const out = await run(["messenger", "logs", CHANNEL_ID]);
      expect(out).toContain(`[파일] ${"가".repeat(30)}… (2.0KB) 확인`);
    });

    it("text 가 파일명과 공백·정규화만 다르면 같은 이름으로 보고 다시 붙이지 않는다", async () => {
      const nfc = "보고서.pdf";
      stubLogs([
        {
          id: "log-n",
          ...base,
          type: "FILE",
          text: `${nfc.normalize("NFD")} `,
          file: { id: FILE_ID, fileName: nfc, fileSize: 2048 },
        },
      ]);
      const out = await run(["messenger", "logs", CHANNEL_ID]);
      expect(out).toContain("[파일] 보고서.pdf (2.0KB)");
      expect(out).not.toContain(`(2.0KB) ${nfc.normalize("NFD")}`);
      expect(out).not.toContain(`(2.0KB) ${nfc}`);
    });

    it("파일 객체에 이름이 없으면 text 를 이름으로 쓴다", async () => {
      stubLogs([
        {
          id: "log-x",
          ...base,
          type: "FILE",
          text: "a.png",
          file: { id: FILE_ID },
        },
      ]);
      const out = await run(["messenger", "logs", CHANNEL_ID]);
      expect(out).toContain("[파일] a.png (-)");
    });

    it("스레드가 달린 메시지는 참조에 댓글 수와 스레드 channelId 를 보여준다", async () => {
      stubLogs([
        {
          id: "log-t",
          ...base,
          text: "배포 시작",
          thread: { channelId: THREAD_ID, totalCount: "3", lastUpdatedAt: 1760000000000 },
        },
      ]);
      const out = await run(["messenger", "logs", CHANNEL_ID]);
      expect(out).toContain("배포 시작");
      expect(out).toContain(`스레드(3) ${THREAD_ID}`);
    });

    it("파일과 스레드가 둘 다 있으면 참조 칸에 줄을 나눠 둘 다 보여준다", async () => {
      stubLogs([
        {
          id: "log-ft",
          ...base,
          type: "FILE",
          text: "a.txt",
          file: { id: FILE_ID, fileName: "a.txt", fileSize: 1 },
          thread: { channelId: THREAD_ID, totalCount: "1" },
        },
      ]);
      const out = await run(["messenger", "logs", CHANNEL_ID]);
      const fileLine = out.split("\n").findIndex((l) => l.includes(`파일 ${FILE_ID}`));
      const threadLine = out.split("\n").findIndex((l) => l.includes(`스레드(1) ${THREAD_ID}`));
      expect(fileLine).toBeGreaterThanOrEqual(0);
      expect(threadLine).toBe(fileLine + 1);
    });

    it("파일도 스레드도 없으면 참조 칸은 비고 내용은 그대로다", async () => {
      const out = await run(["messenger", "logs", CHANNEL_ID]);
      expect(out).toContain("참조");
      expect(out).toContain("첫 번째");
      expect(out).not.toContain("[파일]");
      expect(out).not.toContain("스레드(");
    });

    it("참조 칸의 서버 값도 control char 를 없앤다", async () => {
      stubLogs([
        { id: "log-x", ...base, text: "t", thread: { channelId: `${THREAD_ID}${ESC}[31m`, totalCount: "1" } },
      ]);
      const out = await run(["messenger", "logs", CHANNEL_ID]);
      expect(out).toContain(`${THREAD_ID}?[31m`);
    });

    it("--json 은 file·thread 를 포함한 원형 그대로다", async () => {
      const raw: MessengerLog[] = [
        {
          id: "log-ft",
          ...base,
          type: "FILE",
          text: "a.txt",
          file: { id: FILE_ID, fileName: "a.txt", fileSize: 1 },
          thread: { channelId: THREAD_ID, totalCount: "1" },
        },
      ];
      stubLogs(raw);
      const out = await run(["--json", "messenger", "logs", CHANNEL_ID]);
      expect(JSON.parse(out)).toEqual(raw);
    });

    it("--quiet 은 로그 id 만 낸다", async () => {
      stubLogs([
        { id: "log-f", ...base, text: "a.txt", file: { id: FILE_ID, fileName: "a.txt", fileSize: 1 } },
      ]);
      const out = await run(["--quiet", "messenger", "logs", CHANNEL_ID]);
      expect(out.trim()).toBe("log-f");
    });
  });
});
