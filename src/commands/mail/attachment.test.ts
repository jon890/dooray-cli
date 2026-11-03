import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Config } from "../../config/types.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";

const mocks = vi.hoisted(() => ({
  getConfigOrThrow: vi.fn(),
  getMailAttachments: vi.fn(),
  resolveUidByMailId: vi.fn(),
  startSpinner: vi.fn(() => ({ text: "" })),
  stopSpinner: vi.fn(),
}));

vi.mock("../../config/store.js", () => ({
  getConfigOrThrow: mocks.getConfigOrThrow,
}));

vi.mock("../../api/imapClient.js", () => ({
  getMailAttachments: mocks.getMailAttachments,
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

const twoAttachments = [
  { index: 1, fileName: "a.txt", size: 3, contentType: "text/plain", inline: false, content: Buffer.from("AAA") },
  { index: 2, fileName: "b.txt", size: 3, contentType: "text/plain", inline: false, content: Buffer.from("BBB") },
];

let dir: string;

async function run(args: string[], globals: string[] = []): Promise<void> {
  vi.resetModules();
  const { mailAttachmentCommand } = await import("./attachment.js");
  const program = new Command().option("--json").option("--quiet").addCommand(mailAttachmentCommand);
  await program.parseAsync([...globals, "attachment", ...args, "-o", dir], { from: "user" });
}

function stdout(): string {
  return vi.mocked(process.stdout.write).mock.calls.map(([v]) => String(v)).join("");
}

function stderr(): string {
  return vi.mocked(process.stderr.write).mock.calls.map(([v]) => String(v)).join("");
}

beforeEach(async () => {
  vi.clearAllMocks();
  dir = await mkdtemp(join(tmpdir(), "mail-attachment-"));
  mocks.getConfigOrThrow.mockResolvedValue(config);
  mocks.getMailAttachments.mockResolvedValue({ subject: "제목", attachments: twoAttachments });
  mocks.resolveUidByMailId.mockResolvedValue(991);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(async () => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
  await rm(dir, { recursive: true, force: true });
});

describe("mailAttachmentCommand", () => {
  it("첨부를 모두 저장하고 JSON 결과에 경로를 담는다", async () => {
    await run(["337"], ["--json"]);

    expect(await readFile(join(dir, "a.txt"), "utf8")).toBe("AAA");
    expect(await readFile(join(dir, "b.txt"), "utf8")).toBe("BBB");
    expect(JSON.parse(stdout())).toEqual({
      count: 2,
      succeeded: [
        { path: join(dir, "a.txt"), fileName: "a.txt" },
        { path: join(dir, "b.txt"), fileName: "b.txt" },
      ],
      failed: [],
    });
    expect(process.exitCode).toBeUndefined();
  });

  it("--id 로 고른 첨부만 저장한다", async () => {
    await run(["337", "--id", "2"]);

    expect(await readdir(dir)).toEqual(["b.txt"]);
  });

  it("같은 이름의 파일이 있으면 그 첨부는 실패하고 --force 면 덮어쓴다", async () => {
    await writeFile(join(dir, "a.txt"), "OLD");

    await run(["337"], ["--json"]);

    expect(await readFile(join(dir, "a.txt"), "utf8")).toBe("OLD");
    expect(await readFile(join(dir, "b.txt"), "utf8")).toBe("BBB");
    const result = JSON.parse(stdout());
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].fileId).toBe("1");
    expect(process.exitCode).toBe(1);

    process.exitCode = undefined;
    await run(["337", "--force"]);

    expect(await readFile(join(dir, "a.txt"), "utf8")).toBe("AAA");
    expect(process.exitCode).toBeUndefined();
  });

  it("없는 순번은 파일을 쓰기 전에 EXIT_PARAM_ERROR 로 중단한다", async () => {
    await expect(run(["337", "--id", "1", "--id", "9"])).rejects.toMatchObject({
      exitCode: EXIT_PARAM_ERROR,
      message: expect.stringContaining("9"),
    });

    expect(await readdir(dir)).toEqual([]);
    expect(mocks.stopSpinner).toHaveBeenCalledWith(false);
  });

  it.each([["0"], ["abc"]])("--id %s 는 설정 조회 전에 거절한다", async (id) => {
    await expect(run(["337", "--id", id])).rejects.toMatchObject({ exitCode: EXIT_PARAM_ERROR });

    expect(mocks.getConfigOrThrow).not.toHaveBeenCalled();
    expect(mocks.getMailAttachments).not.toHaveBeenCalled();
  });

  it("첨부가 없는 메일은 종료 코드 0 으로 끝나고 파일을 만들지 않는다", async () => {
    mocks.getMailAttachments.mockResolvedValue({ subject: "제목", attachments: [] });

    await run(["337"]);

    expect(stdout()).toContain("첨부파일이 없습니다.");
    expect(await readdir(dir)).toEqual([]);
    expect(process.exitCode).toBeUndefined();
  });

  it("쓰기 오류가 난 첨부만 실패로 세고 나머지는 계속 저장한다", async () => {
    await mkdir(join(dir, "a.txt"));

    await run(["337"], ["--json"]);

    const result = JSON.parse(stdout());
    expect(result.failed.map((f: { fileId: string }) => f.fileId)).toEqual(["1"]);
    expect(result.succeeded).toHaveLength(1);
    expect(await readFile(join(dir, "b.txt"), "utf8")).toBe("BBB");
    expect(process.exitCode).toBe(1);
  });

  it("대상 메일 줄은 평문, --json, --quiet 모두 stderr 에 한 번씩 쓴다", async () => {
    await run(["337"]);
    expect(stderr().match(/대상 메일: UID 337 "제목"/g)).toHaveLength(1);

    vi.mocked(process.stderr.write).mockClear();
    await run(["337", "--force"], ["--json"]);
    expect(stderr().match(/대상 메일: UID 337 "제목"/g)).toHaveLength(1);

    vi.mocked(process.stderr.write).mockClear();
    await run(["337", "--force"], ["--quiet"]);
    expect(stderr().match(/대상 메일: UID 337 "제목"/g)).toHaveLength(1);
  });

  it("--quiet 는 저장한 경로만 stdout 에 쓴다", async () => {
    await run(["337"], ["--quiet"]);

    expect(stdout()).toBe(`${join(dir, "a.txt")}\n${join(dir, "b.txt")}\n`);
  });

  it("메일 웹 주소는 mail id 와 사서함 이름으로 UID 를 찾는다", async () => {
    await run(["https://example.dooray.com/mail/systems/sent/1234567890123456789"]);

    expect(mocks.resolveUidByMailId).toHaveBeenCalledWith(config, "1234567890123456789", "sent");
    expect(mocks.getMailAttachments).toHaveBeenCalledWith(config, 991, "sent");
  });

  it("첨부가 없는 메일에 --id 를 주면 첨부 없음 안내와 함께 중단한다", async () => {
    mocks.getMailAttachments.mockResolvedValue({ subject: "제목", attachments: [] });

    await expect(run(["337", "--id", "1"])).rejects.toMatchObject({
      exitCode: EXIT_PARAM_ERROR,
      message: expect.stringContaining("첨부 없음"),
    });

    expect(await readdir(dir)).toEqual([]);
  });

  it("--id 중복은 합치고 오름차순으로 저장한다", async () => {
    await run(["337", "--id", "2", "--id", "2", "--id", "1"], ["--json"]);

    const result = JSON.parse(stdout());
    expect(result.count).toBe(2);
    expect(result.succeeded.map((s: { fileName: string }) => s.fileName)).toEqual(["a.txt", "b.txt"]);
  });

  it("평문은 저장한 파일마다 체크 줄을 stdout 에 쓴다", async () => {
    await run(["337"]);

    expect(stdout()).toContain("✓ a.txt\n");
    expect(stdout()).toContain("✓ b.txt\n");
  });

  it("제목과 파일 이름의 제어 문자는 터미널 출력에서 ? 로 바꾼다", async () => {
    mocks.getMailAttachments.mockResolvedValue({
      subject: "t\x1b[2Jx",
      attachments: [
        { index: 1, fileName: "f\x1b[31m.txt", size: 1, contentType: "text/plain", inline: false, content: Buffer.from("A") },
      ],
    });

    await run(["337"]);

    expect(stderr()).toContain('"t?[2Jx"');
    expect(stdout()).toContain("✓ f?[31m.txt");
    expect(stdout()).not.toContain("\x1b");
    expect(stderr()).not.toContain("\x1b");
  });
});
