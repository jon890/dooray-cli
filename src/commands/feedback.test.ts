import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EXIT_PARAM_ERROR } from "../utils/exit-codes.js";

const mocks = vi.hoisted(() => ({
  execFile: vi.fn(),
  readLastRun: vi.fn(),
  input: vi.fn(),
  editor: vi.fn(),
  confirm: vi.fn(),
}));

vi.mock("node:child_process", () => ({ execFile: mocks.execFile }));
vi.mock("../cache/last-run.js", () => ({ readLastRun: mocks.readLastRun }));
vi.mock("@inquirer/prompts", () => ({
  input: mocks.input,
  editor: mocks.editor,
  confirm: mocks.confirm,
}));

const originalTTY = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");

function setTTY(isTTY: boolean): void {
  Object.defineProperty(process.stdin, "isTTY", { value: isTTY, configurable: true });
}

async function runFeedback(args: string[]): Promise<void> {
  vi.resetModules();
  const { feedbackCommand } = await import("./feedback.js");
  await feedbackCommand.parseAsync(args, { from: "user" });
}

function ghIssueCreateCalls(): unknown[][] {
  return mocks.execFile.mock.calls.filter(
    ([cmd, args]) => cmd === "gh" && (args as string[])[0] === "issue",
  );
}

let stderr = "";

beforeEach(() => {
  vi.clearAllMocks();
  stderr = "";
  mocks.execFile.mockImplementation(
    (_cmd: string, _args: string[], cb: (err: null, out: { stdout: string; stderr: string }) => void) => {
      cb(null, { stdout: "https://github.com/jon890/dooray-cli/issues/1\n", stderr: "" });
    },
  );
  mocks.readLastRun.mockResolvedValue({
    argv: ["dooray", "post", "get", "<project>", "1"],
    exitCode: 1,
    errorMessage: "API 호출 실패",
    timestamp: "2026-01-01T00:00:00.000Z",
  });
  mocks.confirm.mockResolvedValue(true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    stderr += String(chunk);
    return true;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  if (originalTTY) Object.defineProperty(process.stdin, "isTTY", originalTTY);
  else Reflect.deleteProperty(process.stdin, "isTTY");
});

describe("feedback --last 확인 절차", () => {
  const args = ["--last", "--title", "에러 제목", "--body", "추가 설명"];

  it("non-TTY 에서 --yes 가 없으면 미리보기를 보여 주고 이슈를 만들지 않는다", async () => {
    setTTY(false);

    await expect(runFeedback(args)).rejects.toMatchObject({
      exitCode: EXIT_PARAM_ERROR,
      message: expect.stringContaining("--yes"),
    });
    expect(stderr).toContain("--- 미리보기 ---");
    expect(stderr).toContain("API 호출 실패");
    expect(ghIssueCreateCalls()).toHaveLength(0);
  });

  it("non-TTY 에서 --yes 를 주면 미리보기 후 확인 없이 등록한다", async () => {
    setTTY(false);

    await runFeedback([...args, "--yes"]);

    expect(stderr).toContain("--- 미리보기 ---");
    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(ghIssueCreateCalls()).toHaveLength(1);
  });

  it("TTY 에서는 --title 이 있어도 기본값 아니오로 확인을 받는다", async () => {
    setTTY(true);

    await runFeedback(args);

    expect(mocks.confirm).toHaveBeenCalledWith(
      expect.objectContaining({ default: false }),
    );
    expect(ghIssueCreateCalls()).toHaveLength(1);
  });

  it("TTY 에서 확인을 거절하면 이슈를 만들지 않는다", async () => {
    setTTY(true);
    mocks.confirm.mockResolvedValue(false);

    await runFeedback(args);

    expect(stderr).toContain("취소되었습니다.");
    expect(ghIssueCreateCalls()).toHaveLength(0);
  });

  it("--last 없이 --title 을 주면 종전처럼 확인 없이 등록한다", async () => {
    setTTY(false);

    await runFeedback(["--title", "제목", "--body", "내용"]);

    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(stderr).not.toContain("--- 미리보기 ---");
    expect(ghIssueCreateCalls()).toHaveLength(1);
  });
});
