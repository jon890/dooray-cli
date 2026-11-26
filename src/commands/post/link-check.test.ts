import { beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";

const mocks = vi.hoisted(() => ({
  ensureMe: vi.fn(),
  stopSpinner: vi.fn(),
}));

vi.mock("@/resolvers/me.js", () => ({ ensureMe: mocks.ensureMe }));
vi.mock("@/utils/spinner.js", () => ({ stopSpinner: mocks.stopSpinner, startSpinner: vi.fn() }));

import { addLinkCheckOptions, runLinkCheck } from "./link-check.js";
import { DoorayCliError } from "@/utils/errors.js";
import { EXIT_LINK_CHECK_ERROR } from "@/utils/exit-codes.js";

const ORG = "1234567890123456789";
const POST = "9876543210987654321";
const BROKEN = `[my-project/505 [MOD] 한도](dooray://${ORG}/tasks/${POST} "working")`;

const client = {
  getPostStandalone: vi.fn(async () => ({
    result: { id: POST, project: { id: "p", code: "my-project" }, number: 505, subject: "[MOD] 한도", workflowClass: "working" },
  })),
} as never;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ensureMe.mockResolvedValue({ id: "me", name: "me", orgId: ORG });
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

describe("addLinkCheckOptions", () => {
  it("--fix-links 와 --no-link-check 를 받는다", () => {
    const cmd = addLinkCheckOptions(new Command("t").exitOverride());
    expect(cmd.parse([], { from: "user" }).opts()).toMatchObject({ linkCheck: true });
    const parsed = addLinkCheckOptions(new Command("t").exitOverride())
      .parse(["--fix-links", "--no-link-check"], { from: "user" }).opts();
    expect(parsed).toMatchObject({ fixLinks: true, linkCheck: false });
  });
});

describe("runLinkCheck", () => {
  it("고치지 못한 링크가 있으면 고친 꼴을 담아 종료 코드 7 로 멈춘다", async () => {
    const err = await runLinkCheck(client, {}, BROKEN, { linkCheck: true }).catch((e) => e);
    expect(err).toBeInstanceOf(DoorayCliError);
    expect(err.exitCode).toBe(EXIT_LINK_CHECK_ERROR);
    expect(err.message).toContain(`고친 꼴: [my-project/505 &#91;MOD&#93; 한도](dooray://${ORG}/tasks/${POST} "working")`);
    expect(err.message).toContain("--fix-links");
    expect(mocks.stopSpinner).toHaveBeenCalledWith(false);
  });

  it("--fix-links 면 고친 본문을 돌려준다", async () => {
    const out = await runLinkCheck(client, {}, BROKEN, { linkCheck: true, fixLinks: true });
    expect(out).toBe(`[my-project/505 &#91;MOD&#93; 한도](dooray://${ORG}/tasks/${POST} "working")`);
  });

  it("--no-link-check 면 조회 없이 본문 그대로 돌려준다", async () => {
    const out = await runLinkCheck(client, {}, BROKEN, { linkCheck: false });
    expect(out).toBe(BROKEN);
    expect(mocks.ensureMe).not.toHaveBeenCalled();
  });

  it("업무 링크가 없거나 text/html 본문이면 조회하지 않는다", async () => {
    expect(await runLinkCheck(client, {}, "링크 없음", {})).toBe("링크 없음");
    expect(await runLinkCheck(client, {}, BROKEN, {}, "text/html")).toBe(BROKEN);
    expect(mocks.ensureMe).not.toHaveBeenCalled();
  });
});
