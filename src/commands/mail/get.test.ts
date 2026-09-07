import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import type { Config } from "../../config/types.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";

const mocks = vi.hoisted(() => ({
  getConfigOrThrow: vi.fn(),
  getMail: vi.fn(),
  resolveUidByMailId: vi.fn(),
  startSpinner: vi.fn(() => ({ text: "" })),
  stopSpinner: vi.fn(),
}));

vi.mock("../../config/store.js", () => ({
  getConfigOrThrow: mocks.getConfigOrThrow,
}));

vi.mock("../../api/imapClient.js", () => ({
  getMail: mocks.getMail,
  resolveUidByMailId: mocks.resolveUidByMailId,
}));

vi.mock("../../utils/spinner.js", () => ({
  startSpinner: mocks.startSpinner,
  stopSpinner: mocks.stopSpinner,
}));

const config: Config = {
  version: 1,
  apiKey: "api-key",
  baseUrl: "https://api.dooray.com",
  imapUsername: "user@example.com",
  imapPassword: "secret",
};

const mail = {
  uid: 337,
  subject: "메일 제목",
  from: "Sender <sender@example.com>",
  to: ["Receiver <receiver@example.com>"],
  date: new Date("2026-01-01T00:00:00Z"),
  internalDate: new Date("2026-01-02T03:04:05Z"),
  isRead: true,
  body: "본문",
};

async function runMailGet(args: string[]): Promise<void> {
  vi.resetModules();
  const { mailGetCommand } = await import("./get.js");
  await mailGetCommand.parseAsync(args, { from: "user" });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getConfigOrThrow.mockResolvedValue(config);
  mocks.getMail.mockResolvedValue(mail);
  mocks.resolveUidByMailId.mockResolvedValue(991);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("mailGetCommand", () => {
  it("JSON 날짜와 필드를 유지하고 내부 확인용 도착 시각은 출력하지 않는다", async () => {
    vi.resetModules();
    const { mailGetCommand } = await import("./get.js");
    const program = new Command().option("--json").addCommand(mailGetCommand);

    await program.parseAsync(["--json", "get", "337"], { from: "user" });

    const output = vi.mocked(process.stdout.write).mock.calls
      .map(([value]) => String(value)).join("");
    expect(JSON.parse(output)).toEqual({
      uid: 337,
      subject: "메일 제목",
      from: "Sender <sender@example.com>",
      to: ["Receiver <receiver@example.com>"],
      date: "2026-01-01T00:00:00.000Z",
      isRead: true,
      body: "본문",
    });
  });

  it.each([
    [""],
    ["0"],
    ["abc"],
    ["https://example.dooray.com/task/to/1234567890123456789"],
    ["https://example.dooray.com/mail/systems/inbox/not-a-number"],
  ])("잘못된 입력 %s 은 설정 조회 전에 거절한다", async (target) => {
    await expect(runMailGet([target])).rejects.toMatchObject({
      exitCode: EXIT_PARAM_ERROR,
      message: expect.stringContaining(target),
    });
    expect(mocks.getConfigOrThrow).not.toHaveBeenCalled();
    expect(mocks.resolveUidByMailId).not.toHaveBeenCalled();
    expect(mocks.getMail).not.toHaveBeenCalled();
    expect(mocks.startSpinner).not.toHaveBeenCalled();
  });

  it("메일 웹 주소는 mail id 와 사서함 이름으로 UID 를 찾는다", async () => {
    await runMailGet([
      "https://example.dooray.com/mail/systems/sent/1234567890123456789",
    ]);

    expect(mocks.resolveUidByMailId).toHaveBeenCalledWith(
      config,
      "1234567890123456789",
      "sent",
    );
    expect(mocks.getMail).toHaveBeenCalledWith(config, 991, "sent");
    expect(mocks.startSpinner).toHaveBeenCalledWith("메일 찾는 중...");
    expect(mocks.startSpinner.mock.results[0].value.text).toBe("메일 조회 중...");
  });

  it("19자리 mail id 는 문자열 그대로 UID 조회에 전달한다", async () => {
    await runMailGet(["1234567890123456789"]);

    expect(mocks.resolveUidByMailId).toHaveBeenCalledWith(
      config,
      "1234567890123456789",
      "INBOX",
    );
    expect(mocks.getMail).toHaveBeenCalledWith(config, 991, "INBOX");
  });

  it.each([1, 337, 4294967295])("UID %s 는 mail id 조회 없이 숫자 UID 로 메일을 조회한다", async (uid) => {
    await runMailGet([String(uid)]);

    expect(mocks.resolveUidByMailId).not.toHaveBeenCalled();
    expect(mocks.getMail).toHaveBeenCalledWith(config, uid, "INBOX");
    expect(mocks.startSpinner).toHaveBeenCalledWith("메일 조회 중...");
  });

  it("UID 탐색에 실패하면 스피너를 종료하고 메일 조회 없이 오류를 전달한다", async () => {
    const error = new Error("ECONNREFUSED");
    mocks.resolveUidByMailId.mockRejectedValueOnce(error);

    await expect(runMailGet(["1234567890123456789"])).rejects.toBe(error);

    expect(mocks.getMail).not.toHaveBeenCalled();
    expect(mocks.stopSpinner).toHaveBeenCalledWith(false);
  });
});
