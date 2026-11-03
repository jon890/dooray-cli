import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Config } from "../config/types.js";

const mocks = vi.hoisted(() => ({
  sendMail: vi.fn(),
  createTransport: vi.fn(),
}));

vi.mock("nodemailer", () => ({
  default: { createTransport: mocks.createTransport },
}));
// MailComposer 는 진짜를 쓴다. 원문 조립은 mock 하지 않고 검사한다.

const config: Config = {
  version: 1,
  apiKey: "api-key",
  baseUrl: "https://api.dooray.com",
  imapUsername: "user@example.com",
  imapPassword: "secret",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createTransport.mockReturnValue({ sendMail: mocks.sendMail });
  mocks.sendMail.mockResolvedValue({ messageId: "<m@example.com>", accepted: [], rejected: [] });
});

describe("sendMail 원문", () => {
  it("SMTP 로 보낸 raw 와 반환한 raw 가 같은 바이트다", async () => {
    const { sendMail } = await import("./smtpClient.js");
    const sent = await sendMail(config, {
      to: ["a@example.com"],
      cc: ["c@example.com"],
      bcc: ["b@example.com"],
      subject: "제목",
      body: "본문",
    });

    const arg = mocks.sendMail.mock.calls[0][0];
    expect(Buffer.isBuffer(arg.raw)).toBe(true);
    expect(arg.raw.equals(sent.raw)).toBe(true);
  });

  it("Message-ID 가 원문 헤더와 반환값에서 일치하고 Bcc 헤더는 원문에 없다", async () => {
    const { sendMail } = await import("./smtpClient.js");
    const sent = await sendMail(config, {
      to: ["a@example.com"],
      bcc: ["b@example.com"],
      subject: "제목",
      body: "본문",
    });

    const text = sent.raw.toString("utf8");
    expect(text).toContain(`Message-ID: ${sent.messageId}`);
    expect(text).not.toMatch(/^Bcc:/im);
  });

  it("envelope 수신자에 to, cc, bcc 를 모두 담는다", async () => {
    const { sendMail } = await import("./smtpClient.js");
    await sendMail(config, {
      to: ["a@example.com"],
      cc: ["c@example.com"],
      bcc: ["b@example.com"],
      subject: "s",
      body: "b",
    });

    expect(mocks.sendMail.mock.calls[0][0].envelope).toEqual({
      from: "user@example.com",
      to: ["a@example.com", "c@example.com", "b@example.com"],
    });
  });
});

describe("sendMail attachments", () => {
  it("첨부 파일 이름이 원문에 들어간다", async () => {
    const { sendMail } = await import("./smtpClient.js");
    const sent = await sendMail(config, {
      to: ["a@example.com"],
      subject: "s",
      body: "b",
      attachments: [{ filename: "note.txt", content: "hi" } as never],
    });
    expect(sent.raw.toString("utf8")).toContain("note.txt");
  });
});
