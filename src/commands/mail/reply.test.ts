import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Config } from "../../config/types.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";

const mocks = vi.hoisted(() => ({
  getConfigOrThrow: vi.fn(),
  getMail: vi.fn(),
  resolveUidByMailId: vi.fn(),
  sendMail: vi.fn(),
  confirm: vi.fn(),
  startSpinner: vi.fn(() => ({ text: "" })),
  stopSpinner: vi.fn(),
  client: {
    getMailboxLock: vi.fn(),
    fetchOne: vi.fn(),
  },
  connectImapClient: vi.fn(),
  closeImapClient: vi.fn(),
  release: vi.fn(),
}));

vi.mock("../../config/store.js", () => ({
  getConfigOrThrow: mocks.getConfigOrThrow,
}));

vi.mock("../../api/imapClient.js", () => ({
  getMail: mocks.getMail,
  resolveUidByMailId: mocks.resolveUidByMailId,
  createImapClient: vi.fn(() => mocks.client),
  connectImapClient: mocks.connectImapClient,
  closeImapClient: mocks.closeImapClient,
  getImapConfigOrThrow: vi.fn(),
}));

vi.mock("../../api/smtpClient.js", () => ({
  sendMail: mocks.sendMail,
}));

vi.mock("@inquirer/prompts", () => ({ confirm: mocks.confirm }));

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

const originalMail = {
  uid: 991,
  subject: "원본 제목",
  from: "Sender <sender@example.com>",
  to: ["Receiver <receiver@example.com>"],
  date: new Date("2026-01-01T00:00:00Z"),
  internalDate: new Date("2026-01-02T03:04:05Z"),
  isRead: false,
  body: "원본 본문",
};

async function runMailReply(args: string[]): Promise<void> {
  vi.resetModules();
  const { mailReplyCommand } = await import("./reply.js");
  await mailReplyCommand.parseAsync(args, { from: "user" });
}

const originalTTY = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");

function setTTY(isTTY: boolean): void {
  Object.defineProperty(process.stdin, "isTTY", { value: isTTY, configurable: true });
}

beforeEach(() => {
  vi.clearAllMocks();
  setTTY(true);
  mocks.confirm.mockReset().mockResolvedValue(true);
  mocks.getConfigOrThrow.mockResolvedValue(config);
  mocks.getMail.mockResolvedValue(originalMail);
  mocks.resolveUidByMailId.mockResolvedValue(991);
  mocks.sendMail.mockResolvedValue({
    messageId: "<reply@example.com>",
    accepted: ["sender@example.com"],
    rejected: [],
  });
  mocks.client.getMailboxLock.mockResolvedValue({ release: mocks.release });
  mocks.client.fetchOne.mockResolvedValue({
    envelope: { messageId: "<original@example.com>" },
  });
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(() => {
  vi.restoreAllMocks();
  if (originalTTY) Object.defineProperty(process.stdin, "isTTY", originalTTY);
  else Reflect.deleteProperty(process.stdin, "isTTY");
});

describe("mailReplyCommand", () => {
  it("메일 웹 주소는 UID 조회를 한 번만 하고 원본 조회와 Message-ID 조회에 같은 UID·사서함을 쓴다", async () => {
    await runMailReply([
      "https://example.dooray.com/mail/systems/sent/1234567890123456789",
      "--body",
      "답장 본문",
    ]);

    expect(mocks.resolveUidByMailId).toHaveBeenCalledOnce();
    expect(mocks.resolveUidByMailId).toHaveBeenCalledWith(
      config,
      "1234567890123456789",
      "sent",
    );
    expect(mocks.getMail).toHaveBeenCalledWith(config, 991, "sent");
    expect(mocks.client.getMailboxLock).toHaveBeenCalledWith("sent");
    expect(mocks.client.fetchOne).toHaveBeenCalledWith(
      "991",
      { uid: true, envelope: true },
      { uid: true },
    );
    expect(mocks.release).toHaveBeenCalledOnce();
    expect(mocks.closeImapClient).toHaveBeenCalledWith(mocks.client);
    expect(mocks.startSpinner.mock.results[0].value.text).toBe("원본 메일 조회 중...");
    expect(mocks.sendMail).toHaveBeenCalledWith(
      config,
      expect.objectContaining({
        to: ["sender@example.com"],
        body: "답장 본문",
        inReplyTo: "<original@example.com>",
        references: "<original@example.com>",
      }),
    );
  });

  it.each([
    ["0"],
    ["abc"],
    ["https://example.dooray.com/task/to/1234567890123456789"],
    ["https://example.dooray.com/mail/systems/inbox/not-a-number"],
  ])("잘못된 입력 %s 은 설정 조회 전에 거절한다", async (target) => {
    await expect(runMailReply([target, "--body", "답장 본문"]))
      .rejects.toMatchObject({
        exitCode: EXIT_PARAM_ERROR,
        message: expect.stringContaining(target),
      });
    expect(mocks.getConfigOrThrow).not.toHaveBeenCalled();
    expect(mocks.resolveUidByMailId).not.toHaveBeenCalled();
    expect(mocks.getMail).not.toHaveBeenCalled();
    expect(mocks.sendMail).not.toHaveBeenCalled();
    expect(mocks.connectImapClient).not.toHaveBeenCalled();
    expect(mocks.startSpinner).not.toHaveBeenCalled();
  });

  it("19자리 mail id 는 문자열을 유지하고 한 번 찾은 UID 로 답장한다", async () => {
    await runMailReply(["1234567890123456789", "--body", "답장 본문"]);

    expect(mocks.resolveUidByMailId).toHaveBeenCalledExactlyOnceWith(
      config,
      "1234567890123456789",
      "INBOX",
    );
    expect(mocks.getMail).toHaveBeenCalledWith(config, 991, "INBOX");
    expect(mocks.client.getMailboxLock).toHaveBeenCalledWith("INBOX");
    expect(mocks.client.fetchOne).toHaveBeenCalledWith(
      "991",
      { uid: true, envelope: true },
      { uid: true },
    );
    expect(mocks.sendMail).toHaveBeenCalledOnce();
  });

  it.each([true, false])("TTY %s에서 UID 직접 입력은 탐색과 확인을 생략한다", async (isTTY) => {
    setTTY(isTTY);
    await runMailReply(["337", "--body", "답장 본문"]);

    expect(mocks.resolveUidByMailId).not.toHaveBeenCalled();
    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(mocks.getMail).toHaveBeenCalledWith(config, 337, "INBOX");
    expect(mocks.client.getMailboxLock).toHaveBeenCalledWith("INBOX");
    expect(mocks.client.fetchOne).toHaveBeenCalledWith(
      "337",
      { uid: true, envelope: true },
      { uid: true },
    );
    expect(mocks.sendMail).toHaveBeenCalledOnce();
  });

  it.each([
    "1234567890123456789",
    "https://example.dooray.com/mail/systems/inbox/1234567890123456789",
  ])("non-TTY 추정 입력 %s은 설정 조회 전에 차단한다", async (target) => {
    setTTY(false);

    await expect(runMailReply([target, "--body", "답장 본문"]))
      .rejects.toMatchObject({
        exitCode: EXIT_PARAM_ERROR,
        message: expect.stringContaining("--yes(-y)"),
      });

    expect(mocks.getConfigOrThrow).not.toHaveBeenCalled();
    expect(mocks.resolveUidByMailId).not.toHaveBeenCalled();
    expect(mocks.getMail).not.toHaveBeenCalled();
    expect(mocks.connectImapClient).not.toHaveBeenCalled();
    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it.each([
    [true, "--yes"], [true, "-y"],
    [false, "--yes"], [false, "-y"],
  ] as const)("TTY %s에서 %s는 추정 원본 확인을 생략한다", async (isTTY, flag) => {
    setTTY(isTTY);
    mocks.confirm.mockResolvedValueOnce(false);

    await runMailReply(["1234567890123456789", "--body", "답장 본문", flag]);

    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(mocks.sendMail).toHaveBeenCalledOnce();
  });

  it("추정 원본 확인은 기본값이 아니오이고 IMAP 도착 시각을 보여준다", async () => {
    await runMailReply(["1234567890123456789", "--body", "답장 본문"]);

    expect(mocks.confirm).toHaveBeenCalledExactlyOnceWith({
      message: [
        "도착 시각으로 찾은 원본 메일입니다.",
        "  제목: 원본 제목",
        "  보낸사람: Sender <sender@example.com>",
        "  IMAP 도착 시각: 2026-01-02T03:04:05.000Z",
        "  UID: 991",
        "이 메일에 답장할까요?",
      ].join("\n"),
      default: false,
    }, { output: process.stderr });
    expect(mocks.stopSpinner.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.confirm.mock.invocationCallOrder[0]);
    expect(mocks.confirm.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.sendMail.mock.invocationCallOrder[0]);
  });

  it.each([null, undefined])("도착 시각이 %s이면 알 수 없음으로 표시한다", async (internalDate) => {
    mocks.getMail.mockResolvedValueOnce({ ...originalMail, internalDate });

    await runMailReply(["1234567890123456789", "--body", "답장 본문"]);

    expect(mocks.confirm).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("IMAP 도착 시각: 알 수 없음") }),
      { output: process.stderr },
    );
    expect(mocks.sendMail).toHaveBeenCalledOnce();
  });

  it("확인 화면의 제목과 발신자로 행이나 터미널 명령을 위조하지 못한다", async () => {
    mocks.getMail.mockResolvedValueOnce({
      ...originalMail,
      subject: "제목\r\n  UID: 999\x1b[31m\x9b2J\u2028끝",
      from: "발신자\n  제목: 위조\x1b]0;title\x07\u2029끝 <sender@example.com>",
    });
    mocks.confirm.mockResolvedValueOnce(false);

    await runMailReply(["1234567890123456789", "--body", "답장 본문"]);

    const message = mocks.confirm.mock.calls[0][0].message;
    expect(message).not.toMatch(/[\x00-\x09\x0B-\x1F\x7F-\x9F\u2028\u2029]/);
    expect(message.split("\n").filter((line: string) => line.startsWith("  UID:")))
      .toEqual(["  UID: 991"]);
    expect(message.split("\n").filter((line: string) => line.startsWith("  제목:")))
      .toHaveLength(1);
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it("원본 확인을 거절하면 정상 취소하고 SMTP를 호출하지 않는다", async () => {
    mocks.confirm.mockResolvedValueOnce(false);

    await expect(runMailReply(["1234567890123456789", "--body", "답장 본문"]))
      .resolves.toBeUndefined();

    expect(mocks.sendMail).not.toHaveBeenCalled();
    expect(process.stderr.write).toHaveBeenCalledWith("취소되었습니다.\n");
    expect(process.stdout.write).not.toHaveBeenCalled();
    expect(mocks.startSpinner).not.toHaveBeenCalledWith("답장 발송 중...");
  });

  it("본문이 없으면 UID 탐색이나 IMAP 연결 없이 종료한다", async () => {
    const exit = new Error("process.exit");
    vi.spyOn(process, "exit").mockImplementation(() => { throw exit; });

    await expect(runMailReply(["1234567890123456789"])).rejects.toBe(exit);

    expect(process.exit).toHaveBeenCalledWith(EXIT_PARAM_ERROR);
    expect(process.stderr.write).toHaveBeenCalledWith(
      "오류: --body 또는 --body-file을 지정하세요\n",
    );
    expect(mocks.resolveUidByMailId).not.toHaveBeenCalled();
    expect(mocks.connectImapClient).not.toHaveBeenCalled();
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it("UID 탐색에 실패하면 원본 조회와 답장을 실행하지 않는다", async () => {
    const error = new Error("ECONNREFUSED");
    mocks.resolveUidByMailId.mockRejectedValueOnce(error);

    await expect(runMailReply(["1234567890123456789", "--body", "답장 본문"]))
      .rejects.toBe(error);

    expect(mocks.getMail).not.toHaveBeenCalled();
    expect(mocks.connectImapClient).not.toHaveBeenCalled();
    expect(mocks.sendMail).not.toHaveBeenCalled();
    expect(mocks.stopSpinner).toHaveBeenCalledWith(false);
  });

  it("Message-ID 조회에 실패하면 연결을 정리하고 답장을 실행하지 않는다", async () => {
    const error = new Error("ECONNRESET");
    mocks.client.fetchOne.mockRejectedValueOnce(error);

    await expect(runMailReply(["337", "--body", "답장 본문"]))
      .rejects.toBe(error);

    expect(mocks.release).toHaveBeenCalledOnce();
    expect(mocks.closeImapClient).toHaveBeenCalledWith(mocks.client);
    expect(mocks.sendMail).not.toHaveBeenCalled();
    expect(mocks.stopSpinner).toHaveBeenCalledWith(false);
  });
});
