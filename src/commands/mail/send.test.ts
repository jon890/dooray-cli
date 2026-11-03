import { Readable } from "node:stream";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Config } from "../../config/types.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";

const mocks = vi.hoisted(() => ({
  getConfigOrThrow: vi.fn(),
  sendMail: vi.fn(),
  saveToSent: vi.fn(),
  startSpinner: vi.fn(),
  stopSpinner: vi.fn(),
}));

vi.mock("../../config/store.js", () => ({
  getConfigOrThrow: mocks.getConfigOrThrow,
}));
vi.mock("../../api/smtpClient.js", () => ({ sendMail: mocks.sendMail }));
vi.mock("../../api/imapClient.js", () => ({ saveToSent: mocks.saveToSent }));
vi.mock("../../utils/spinner.js", () => ({
  startSpinner: mocks.startSpinner,
  stopSpinner: mocks.stopSpinner,
}));

const config: Config = {
  version: 1,
  apiKey: "api-key",
  baseUrl: "https://api.dooray.com",
};

async function runMailSend(args: string[]): Promise<void> {
  vi.resetModules();
  const { mailSendCommand } = await import("./send.js");
  await mailSendCommand.parseAsync(
    ["--to", "user@example.com", "--subject", "제목", ...args],
    { from: "user" },
  );
}

function pipeStdin(text: string): void {
  const stream = Object.assign(Readable.from([Buffer.from(text)]), {
    isTTY: undefined,
  });
  vi.spyOn(process, "stdin", "get").mockReturnValue(
    stream as unknown as typeof process.stdin,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getConfigOrThrow.mockResolvedValue(config);
  mocks.sendMail.mockResolvedValue({
    messageId: "<sent@example.com>",
    accepted: ["user@example.com"],
    rejected: [],
    raw: Buffer.from("RAW"),
  });
  mocks.saveToSent.mockResolvedValue({ saved: true });
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("mailSendCommand 본문 입력", () => {
  it("본문이 없으면 process.exit 없이 EXIT_PARAM_ERROR 를 던진다", async () => {
    const exit = vi.spyOn(process, "exit");

    await expect(runMailSend([])).rejects.toMatchObject({
      name: "DoorayCliError",
      exitCode: EXIT_PARAM_ERROR,
      message: "--body 또는 --body-file을 지정하세요",
    });
    expect(exit).not.toHaveBeenCalled();
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it("--body-file - 는 stdin 에서 본문을 읽는다", async () => {
    pipeStdin("stdin 본문");

    await runMailSend(["--body-file", "-"]);

    expect(mocks.sendMail).toHaveBeenCalledWith(
      config,
      expect.objectContaining({ body: "stdin 본문" }),
    );
  });

  it("--body-file 경로는 파일에서 본문을 읽는다", async () => {
    const dir = await mkdtemp(join(tmpdir(), "dooray-mail-send-"));
    const path = join(dir, "body.txt");
    await writeFile(path, "파일 본문");
    try {
      await runMailSend(["--body-file", path]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }

    expect(mocks.sendMail).toHaveBeenCalledWith(
      config,
      expect.objectContaining({ body: "파일 본문" }),
    );
  });

  it("--body 와 --body-file 을 함께 주면 보내지 않는다", async () => {
    await expect(
      runMailSend(["--body", "본문", "--body-file", "x.txt"]),
    ).rejects.toMatchObject({ exitCode: EXIT_PARAM_ERROR });
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });
});

describe("mailSendCommand --attach", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "dooray-mail-send-attach-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("파일 이름과 경로를 attachments 로 넘기고 --json 에 이름 목록을 더한다", async () => {
    const a = join(dir, "사진.jpg");
    const b = join(dir, "문서.pdf");
    await writeFile(a, "a");
    await writeFile(b, "bb");

    vi.resetModules();
    const { Command } = await import("commander");
    const { mailSendCommand } = await import("./send.js");
    const program = new Command().option("--json").addCommand(mailSendCommand);
    await program.parseAsync(
      ["--json", "send", "--to", "user@example.com", "--subject", "제목", "--body", "본문", "--attach", a, b],
      { from: "user" },
    );

    expect(mocks.sendMail).toHaveBeenCalledWith(
      config,
      expect.objectContaining({
        attachments: [
          { path: a, filename: "사진.jpg", size: 1 },
          { path: b, filename: "문서.pdf", size: 2 },
        ],
      }),
    );
    const out = vi.mocked(process.stdout.write).mock.calls.map((c) => String(c[0])).join("");
    expect(JSON.parse(out).attachments).toEqual(["사진.jpg", "문서.pdf"]);
  });

  it("없는 파일이 하나라도 있으면 보내지 않는다", async () => {
    const a = join(dir, "a.txt");
    await writeFile(a, "a");
    await expect(
      runMailSend(["--body", "본문", "--attach", a, join(dir, "none.txt")]),
    ).rejects.toMatchObject({ exitCode: EXIT_PARAM_ERROR });
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it("디렉터리를 주면 보내지 않는다", async () => {
    await expect(
      runMailSend(["--body", "본문", "--attach", dir]),
    ).rejects.toMatchObject({ exitCode: EXIT_PARAM_ERROR });
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });
});

describe("mailSendCommand 보낸메일함 저장", () => {
  it("발송한 원문 그대로 보낸메일함에 저장한다", async () => {
    await runMailSend(["--body", "본문"]);

    expect(mocks.saveToSent).toHaveBeenCalledWith(config, Buffer.from("RAW"));
  });

  it("--no-save-sent 면 IMAP 을 열지 않는다", async () => {
    await runMailSend(["--body", "본문", "--no-save-sent"]);

    expect(mocks.sendMail).toHaveBeenCalledTimes(1);
    expect(mocks.saveToSent).not.toHaveBeenCalled();
  });

  it("저장이 실패해도 재발송하지 않고 경고만 내며 정상 종료한다", async () => {
    mocks.saveToSent.mockResolvedValue({ saved: false, reason: "APPEND 거부" });
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    await expect(runMailSend(["--body", "본문"])).resolves.toBeUndefined();

    expect(mocks.sendMail).toHaveBeenCalledTimes(1);
    expect(stderr.mock.calls.map((c) => String(c[0])).join("")).toContain("APPEND 거부");
  });

  it("--json 에 저장 결과를 더하고 원문 raw 는 싣지 않는다", async () => {
    mocks.saveToSent.mockResolvedValue({ saved: false, reason: "권한 없음" });
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const { Command } = await import("commander");
    vi.resetModules();
    const { mailSendCommand } = await import("./send.js");
    const program = new Command().option("--json").addCommand(mailSendCommand);
    await program.parseAsync(
      ["--json", "send", "--to", "user@example.com", "--subject", "제목", "--body", "본문"],
      { from: "user" },
    );

    const out = JSON.parse(stdout.mock.calls.map((c) => String(c[0])).join(""));
    expect(out).toMatchObject({ savedToSent: false, saveSentError: "권한 없음" });
    expect(out).not.toHaveProperty("raw");
  });
});
