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
  startSpinner: vi.fn(),
  stopSpinner: vi.fn(),
}));

vi.mock("../../config/store.js", () => ({
  getConfigOrThrow: mocks.getConfigOrThrow,
}));
vi.mock("../../api/smtpClient.js", () => ({ sendMail: mocks.sendMail }));
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
  });
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
