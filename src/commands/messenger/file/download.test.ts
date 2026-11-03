import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";

const mocks = vi.hoisted(() => ({
  getConfigOrThrow: vi.fn(),
  resolveMessengerChannel: vi.fn(),
  startSpinner: vi.fn(),
  stopSpinner: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  stat: vi.fn(),
  client: {
    downloadMessengerFile: vi.fn(),
  },
}));

vi.mock("../../../config/store.js", () => ({
  getConfigOrThrow: mocks.getConfigOrThrow,
}));

vi.mock("../../../api/client.js", () => ({
  DoorayApiClient: vi.fn(function MockDoorayApiClient() {
    return mocks.client;
  }),
}));

vi.mock("../../../resolvers/messenger-channel.js", () => ({
  resolveMessengerChannel: mocks.resolveMessengerChannel,
}));

vi.mock("../../../utils/spinner.js", () => ({
  startSpinner: mocks.startSpinner,
  stopSpinner: mocks.stopSpinner,
}));

vi.mock("node:fs/promises", () => ({
  writeFile: mocks.writeFile,
  mkdir: mocks.mkdir,
  stat: mocks.stat,
}));

const CHANNEL_ID = "1234567890123456789";
const FILE_ID = "3333444455556666777";

async function createCommandTree(): Promise<Command> {
  vi.resetModules();
  const { messengerFileCommand } = await import("./index.js");
  const program = new Command()
    .name("dooray")
    .option("--json", "JSON 형식으로 출력")
    .option("--quiet", "ID만 출력");
  const messengerCommand = new Command("messenger");
  messengerCommand.addCommand(messengerFileCommand);
  program.addCommand(messengerCommand);
  program.exitOverride();
  return program;
}

const baseArgs = ["node", "dooray", "messenger", "file", "download", "배포알림", FILE_ID, "-o", "/tmp/out"];

let written: string;
let stdoutSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  written = "";
  stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    written += String(chunk);
    return true;
  });
  mocks.getConfigOrThrow.mockResolvedValue({
    apiKey: "test-api-key",
    baseUrl: "https://example.dooray.com",
  });
  mocks.resolveMessengerChannel.mockResolvedValue(CHANNEL_ID);
  mocks.client.downloadMessengerFile.mockResolvedValue({
    buffer: new ArrayBuffer(5),
    fileName: "report.txt",
  });
  mocks.writeFile.mockResolvedValue(undefined);
  mocks.mkdir.mockResolvedValue(undefined);
  mocks.stat.mockRejectedValue(new Error("ENOENT"));
});

afterEach(() => {
  stdoutSpy.mockRestore();
});

describe("messenger file download", () => {
  it("대화방 이름을 channelId 로 풀어 다운로드하고 저장 경로 한 줄을 찍는다", async () => {
    const program = await createCommandTree();
    await program.parseAsync(baseArgs);
    expect(mocks.resolveMessengerChannel).toHaveBeenCalledWith(mocks.client, "배포알림");
    expect(mocks.client.downloadMessengerFile).toHaveBeenCalledWith(CHANNEL_ID, FILE_ID);
    expect(mocks.writeFile).toHaveBeenCalledWith("/tmp/out/report.txt", expect.any(Uint8Array));
    expect(written).toBe("/tmp/out/report.txt\n");
  });

  it("--json 은 저장 결과를 JSON 으로 낸다", async () => {
    const program = await createCommandTree();
    await program.parseAsync([...baseArgs, "--json"]);
    expect(JSON.parse(written)).toEqual({
      outputPath: "/tmp/out/report.txt",
      fileName: "report.txt",
      size: 5,
    });
  });

  it("--output-file 은 그 경로로 저장한다", async () => {
    const program = await createCommandTree();
    await program.parseAsync([
      "node", "dooray", "messenger", "file", "download", CHANNEL_ID, FILE_ID,
      "--output-file", "/tmp/x/내 이름.txt",
    ]);
    expect(mocks.mkdir).toHaveBeenCalledWith("/tmp/x", { recursive: true });
    expect(mocks.writeFile).toHaveBeenCalledWith("/tmp/x/내 이름.txt", expect.any(Uint8Array));
    expect(written).toBe("/tmp/x/내 이름.txt\n");
  });

  it("--output-file 이 디렉터리 경로면 API 를 부르기 전에 거부한다", async () => {
    const program = await createCommandTree();
    await expect(
      program.parseAsync([
        "node", "dooray", "messenger", "file", "download", CHANNEL_ID, FILE_ID, "--output-file", "/tmp/x/",
      ]),
    ).rejects.toMatchObject({ exitCode: 3 });
    expect(mocks.client.downloadMessengerFile).not.toHaveBeenCalled();
  });

  it("다운로드 실패는 spinner 를 실패로 닫고 그대로 던진다", async () => {
    mocks.client.downloadMessengerFile.mockRejectedValue(new Error("404"));
    const program = await createCommandTree();
    await expect(program.parseAsync(baseArgs)).rejects.toThrow("404");
    expect(mocks.stopSpinner).toHaveBeenCalledWith(false);
    expect(mocks.writeFile).not.toHaveBeenCalled();
  });
});
