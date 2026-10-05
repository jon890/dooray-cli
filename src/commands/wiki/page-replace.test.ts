import { beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import { DoorayCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";

const mocks = vi.hoisted(() => ({
  getConfigOrThrow: vi.fn(),
  resolveWikiPageInput: vi.fn(),
  startSpinner: vi.fn(),
  stopSpinner: vi.fn(),
  client: {
    getWikiPage: vi.fn(),
    updateWikiPage: vi.fn(),
    updateWikiPageTitle: vi.fn(),
    updateWikiPageContent: vi.fn(),
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

vi.mock("../../resolvers/wiki-page-input.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../resolvers/wiki-page-input.js")>();
  return { ...actual, resolveWikiPageInput: mocks.resolveWikiPageInput };
});

vi.mock("../../utils/spinner.js", () => ({
  startSpinner: mocks.startSpinner,
  stopSpinner: mocks.stopSpinner,
}));

function page(
  body?: { mimeType: string; content?: string },
  extra: Record<string, unknown> = {},
) {
  return {
    result: {
      id: "page-1",
      wikiId: "wiki-1",
      version: 3,
      root: false,
      creator: { type: "member", member: { organizationMemberId: "member-1" } },
      subject: "기존 제목",
      ...(body != null && { body }),
      ...extra,
    },
  };
}

function exitOverrideAll(cmd: Command): void {
  cmd.exitOverride();
  cmd.configureOutput({ writeErr: () => {} });
  cmd.commands.forEach(exitOverrideAll);
}

async function run(args: string[]): Promise<{ stdout: string; error?: unknown }> {
  vi.resetModules();
  const { wikiPageReplaceCommand } = await import("./page-replace.js");
  const program = new Command()
    .name("dooray")
    .option("--json", "JSON 형식으로 출력")
    .option("--quiet", "ID만 출력");
  const wikiCommand = new Command("wiki");
  const pageCommand = new Command("page");
  pageCommand.addCommand(wikiPageReplaceCommand);
  wikiCommand.addCommand(pageCommand);
  program.addCommand(wikiCommand);
  exitOverrideAll(program);

  let stdout = "";
  const out = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    stdout += String(chunk);
    return true;
  });
  try {
    await program.parseAsync(["node", "dooray", ...args]);
    return { stdout };
  } catch (error) {
    return { stdout, error };
  } finally {
    out.mockRestore();
  }
}

function expectParamError(error: unknown, message: RegExp): void {
  // run 이 모듈을 다시 불러 클래스 동일성이 깨지므로 이름으로 판정한다
  expect((error as Error).name).toBe(DoorayCliError.name);
  expect((error as DoorayCliError).exitCode).toBe(EXIT_PARAM_ERROR);
  expect((error as Error).message).toMatch(message);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getConfigOrThrow.mockResolvedValue({
    apiKey: "test-api-key",
    baseUrl: "https://example.dooray.com",
  });
  mocks.resolveWikiPageInput.mockResolvedValue({ wikiId: "wiki-1", pageId: "page-1" });
  mocks.client.getWikiPage.mockResolvedValue(
    page({ mimeType: "text/x-markdown", content: "## 절차\n\n- 백업\n- 배포\n- 확인\n" }),
  );
  mocks.client.updateWikiPageContent.mockResolvedValue({});
});

describe("wiki page replace", () => {
  it("본문만 PUT .../content 로 보내고 제목은 건드리지 않는다", async () => {
    const { stdout, error } = await run([
      "wiki", "page", "replace", "--id", "page-1", "--old", "- 배포\n", "--new", "- 카나리 배포\n- 전체 배포\n",
    ]);

    expect(error).toBeUndefined();
    expect(mocks.resolveWikiPageInput).toHaveBeenCalledWith(mocks.client, expect.objectContaining({ idOpt: "page-1" }));
    expect(mocks.client.updateWikiPageContent).toHaveBeenCalledWith("wiki-1", "page-1", {
      body: {
        mimeType: "text/x-markdown",
        content: "## 절차\n\n- 백업\n- 카나리 배포\n- 전체 배포\n- 확인\n",
      },
    });
    expect(mocks.client.updateWikiPage).not.toHaveBeenCalled();
    expect(mocks.client.updateWikiPageTitle).not.toHaveBeenCalled();
    expect(stdout).toBe("위키 페이지 본문에서 1군데를 치환했습니다: page-1\n");
  });

  it("text/html 본문의 mimeType 을 보존한다", async () => {
    mocks.client.getWikiPage.mockResolvedValue(
      page({ mimeType: "text/html", content: "<p>앞 <mark>형광펜</mark> 뒤</p>" }),
    );

    await run(["wiki", "page", "replace", "--id", "page-1", "--old", "형광펜", "--new", "강조"]);

    expect(mocks.client.updateWikiPageContent.mock.calls[0]?.[2]).toEqual({
      body: { mimeType: "text/html", content: "<p>앞 <mark>강조</mark> 뒤</p>" },
    });
  });

  it("본문이 없는 페이지는 일치 없음으로 거부한다", async () => {
    mocks.client.getWikiPage.mockResolvedValue(page());

    const { error } = await run(["wiki", "page", "replace", "--id", "page-1", "--old", "x", "--new", "y"]);

    expectParamError(error, /찾지 못했습니다/);
    expect(mocks.client.updateWikiPageContent).not.toHaveBeenCalled();
  });

  it("2건 이상인데 --all 이 없으면 거부하고, --all 이면 전부 바꾼다", async () => {
    const rejected = await run(["wiki", "page", "replace", "--id", "page-1", "--old", "- ", "--new", "* "]);
    expectParamError(rejected.error, /3군데/);
    expect(mocks.client.updateWikiPageContent).not.toHaveBeenCalled();

    const { stdout } = await run([
      "--json", "wiki", "page", "replace", "--id", "page-1", "--old", "- ", "--new", "* ", "--all",
    ]);
    expect(mocks.client.updateWikiPageContent.mock.calls[0]?.[2].body.content).toBe(
      "## 절차\n\n* 백업\n* 배포\n* 확인\n",
    );
    expect(JSON.parse(stdout)).toEqual({ wikiId: "wiki-1", pageId: "page-1", replaced: 3 });
  });

  it("--dry-run 은 수정 API 를 부르지 않는다", async () => {
    const { stdout } = await run([
      "wiki", "page", "replace", "--id", "page-1", "--old", "확인", "--new", "모니터링", "--dry-run",
    ]);

    expect(mocks.client.updateWikiPageContent).not.toHaveBeenCalled();
    expect(mocks.client.updateWikiPage).not.toHaveBeenCalled();
    expect(stdout).toBe("@@ 1/1 — 5번째 줄 @@\n-- 확인\n+- 모니터링\n1군데가 바뀝니다 (dry-run, 수정하지 않음).\n");
  });

  it("--json --dry-run 은 pageId 와 구간을 구조로 낸다", async () => {
    const { stdout } = await run([
      "--json", "wiki", "page", "replace", "--id", "page-1", "--old", "확인", "--new", "모니터링", "--dry-run",
    ]);

    expect(mocks.client.updateWikiPageContent).not.toHaveBeenCalled();
    expect(JSON.parse(stdout)).toEqual({
      dryRun: true,
      pageId: "page-1",
      replaced: 1,
      mimeType: "text/x-markdown",
      hunks: [{ line: 5, before: "- 확인", after: "- 모니터링" }],
    });
  });

  it("old 와 new 가 같으면 대상 해석 전에 거부한다", async () => {
    const { error } = await run(["wiki", "page", "replace", "--id", "page-1", "--old", "a", "--new", "a"]);

    expectParamError(error, /같아/);
    expect(mocks.resolveWikiPageInput).not.toHaveBeenCalled();
  });

  it("--new-file 경로가 비면 대상 해석 전에 거부하고 수정하지 않는다", async () => {
    const { error } = await run(["wiki", "page", "replace", "--id", "page-1", "--old", "- 배포", "--new-file", ""]);

    expectParamError(error, /--new-file 경로가 비어 있습니다/);
    expect(mocks.resolveWikiPageInput).not.toHaveBeenCalled();
    expect(mocks.client.updateWikiPageContent).not.toHaveBeenCalled();
  });

  it("페이지 조회가 실패하면 스피너를 실패로 멈춘다", async () => {
    mocks.client.getWikiPage.mockRejectedValue(new Error("get failed"));

    const { error } = await run(["wiki", "page", "replace", "--id", "page-1", "--old", "배포", "--new", "x"]);

    expect((error as Error).message).toBe("get failed");
    expect(mocks.stopSpinner).toHaveBeenCalledWith(false);
    expect(mocks.client.updateWikiPageContent).not.toHaveBeenCalled();
  });

  it("본문 수정이 실패하면 스피너를 실패로 멈춘다", async () => {
    mocks.client.updateWikiPageContent.mockRejectedValue(new Error("update failed"));

    const { error } = await run(["wiki", "page", "replace", "--id", "page-1", "--old", "배포", "--new", "x"]);

    expect((error as Error).message).toBe("update failed");
    expect(mocks.stopSpinner).toHaveBeenLastCalledWith(false);
  });

  it("--dry-run --quiet 은 바뀔 군데 수만 낸다", async () => {
    const { stdout } = await run([
      "--quiet", "wiki", "page", "replace", "--id", "page-1", "--old", "- ", "--new", "* ", "--all", "--dry-run",
    ]);

    expect(mocks.client.updateWikiPageContent).not.toHaveBeenCalled();
    expect(stdout).toBe("3\n");
  });

  describe("첨부 참조 누락", () => {
    // 인라인 이미지는 본문 참조의 id 가 images[].attachFileId 다 (id 와 다르다)
    const withImage = page(
      { mimeType: "text/x-markdown", content: "앞\n![도식.png](/wikis/900/files/attach-1)\n뒤" },
      { images: [{ id: "image-1", attachFileId: "attach-1", name: "도식.png", size: 10 }], files: [] },
    );
    const dropArgs = [
      "wiki", "page", "replace", "--id", "page-1", "--old", "![도식.png](/wikis/900/files/attach-1)\n", "--new", "",
    ];

    beforeEach(() => {
      mocks.client.getWikiPage.mockResolvedValue(withImage);
    });

    it("non-TTY 에서 --no-confirm 이 없으면 경고하고 수정하지 않는다", async () => {
      const isTTY = process.stdin.isTTY;
      Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });
      const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
      try {
        const { error } = await run(dropArgs);

        expectParamError(error, /--no-confirm/);
        expect(stderr.mock.calls.map((c) => String(c[0])).join("")).toContain("도식.png");
        expect(mocks.client.updateWikiPageContent).not.toHaveBeenCalled();
      } finally {
        stderr.mockRestore();
        Object.defineProperty(process.stdin, "isTTY", { value: isTTY, configurable: true });
      }
    });

    it("--no-confirm 이면 경고만 내고 진행한다", async () => {
      const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
      try {
        const { error } = await run([...dropArgs, "--no-confirm"]);

        expect(error).toBeUndefined();
        expect(mocks.client.updateWikiPageContent.mock.calls[0]?.[2].body.content).toBe("앞\n뒤");
      } finally {
        stderr.mockRestore();
      }
    });

    it("--dry-run 에서는 확인하지 않는다", async () => {
      const isTTY = process.stdin.isTTY;
      Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });
      const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
      try {
        const { error, stdout } = await run([...dropArgs, "--dry-run"]);

        expect(error).toBeUndefined();
        expect(stdout).toContain("dry-run");
        expect(stderr.mock.calls.map((c) => String(c[0])).join("")).not.toContain("도식.png");
        expect(mocks.client.updateWikiPageContent).not.toHaveBeenCalled();
      } finally {
        stderr.mockRestore();
        Object.defineProperty(process.stdin, "isTTY", { value: isTTY, configurable: true });
      }
    });

    it("참조가 남으면 확인하지 않는다", async () => {
      const { error } = await run([
        "wiki", "page", "replace", "--id", "page-1", "--old", "앞", "--new", "머리",
      ]);

      expect(error).toBeUndefined();
      expect(mocks.client.updateWikiPageContent).toHaveBeenCalledOnce();
    });
  });

  describe("attachFileId 가 없는 응답 (공식 문서 응답 형태: id·name·size)", () => {
    async function expectGuarded(content: string, extra: Record<string, unknown>, old: string, name: string) {
      mocks.client.getWikiPage.mockResolvedValue(page({ mimeType: "text/x-markdown", content }, extra));
      const isTTY = process.stdin.isTTY;
      Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });
      const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
      try {
        const { error } = await run(["wiki", "page", "replace", "--id", "page-1", "--old", old, "--new", ""]);

        expectParamError(error, /--no-confirm/);
        expect(stderr.mock.calls.map((c) => String(c[0])).join("")).toContain(name);
        expect(mocks.client.updateWikiPageContent).not.toHaveBeenCalled();
      } finally {
        stderr.mockRestore();
        Object.defineProperty(process.stdin, "isTTY", { value: isTTY, configurable: true });
      }
    }

    it("일반 첨부(files[])의 참조가 사라지면 id 로 찾아 확인한다", async () => {
      await expectGuarded(
        "앞\n[설명서.pdf](/wikis/900/files/file-9)\n뒤",
        { files: [{ id: "file-9", name: "설명서.pdf", size: 10 }], images: [] },
        "[설명서.pdf](/wikis/900/files/file-9)\n",
        "설명서.pdf",
      );
    });

    it("인라인 이미지(images[])도 attachFileId 가 없으면 id 로 찾아 확인한다", async () => {
      await expectGuarded(
        "앞\n![도식.png](/wikis/900/files/image-1)\n뒤",
        { images: [{ id: "image-1", name: "도식.png", size: 10 }] },
        "![도식.png](/wikis/900/files/image-1)\n",
        "도식.png",
      );
    });
  });

  it("--quiet 은 pageId 만 낸다", async () => {
    const { stdout } = await run([
      "--quiet", "wiki", "page", "replace", "--id", "page-1", "--old", "확인", "--new", "모니터링",
    ]);

    expect(stdout).toBe("page-1\n");
  });
});
