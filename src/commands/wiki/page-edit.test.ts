import { beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";

const mocks = vi.hoisted(() => ({
  getConfigOrThrow: vi.fn(),
  resolveWikiPageInput: vi.fn(),
  readBodyInput: vi.fn(),
  openInEditor: vi.fn(),
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

vi.mock("../../editor/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../editor/index.js")>();
  return { ...actual, openInEditor: mocks.openInEditor };
});

vi.mock("@/body/body-input.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/body/body-input.js")>();
  return { ...actual, readBodyInput: mocks.readBodyInput };
});

vi.mock("../../utils/spinner.js", () => ({
  startSpinner: mocks.startSpinner,
  stopSpinner: mocks.stopSpinner,
}));

function page(mimeType?: string) {
  return {
    result: {
      id: "page-1",
      wikiId: "wiki-1",
      version: 1,
      root: false,
      creator: { type: "member", member: { organizationMemberId: "member-1" } },
      subject: "기존 제목",
      ...(mimeType != null && { body: { mimeType, content: "기존 본문" } }),
    },
  };
}

function exitOverrideAll(cmd: Command): void {
  cmd.exitOverride();
  cmd.configureOutput({ writeErr: () => {} });
  cmd.commands.forEach(exitOverrideAll);
}

async function createCommandTree(): Promise<Command> {
  vi.resetModules();
  const { wikiPageEditCommand } = await import("./page-edit.js");
  const program = new Command().name("dooray");
  const wikiCommand = new Command("wiki");
  wikiCommand.addCommand(wikiPageEditCommand);
  program.addCommand(wikiCommand);
  return program;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getConfigOrThrow.mockResolvedValue({
    apiKey: "test-api-key",
    baseUrl: "https://example.dooray.com",
  });
  mocks.resolveWikiPageInput.mockResolvedValue({ wikiId: "wiki-1", pageId: "page-1" });
  mocks.readBodyInput.mockResolvedValue("<p>새 본문</p>");
  mocks.client.updateWikiPage.mockResolvedValue({});
  mocks.client.updateWikiPageTitle.mockResolvedValue({});
  mocks.client.updateWikiPageContent.mockResolvedValue({});
});

describe("wiki page edit 입력 형태", () => {
  // resolveWikiPageInput 자체의 동작은 resolvers/wiki-page-input.test.ts 가 확인한다.
  // 여기서는 명령이 무엇을 넘기는지만 본다.
  async function runEdit(argv: string[]): Promise<void> {
    const program = await createCommandTree();
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await program.parseAsync(["node", "dooray", "wiki", "edit", ...argv]);
    stdout.mockRestore();
  }

  it("--id 만 주면 idOpt 로 넘기고 positional 은 비운다", async () => {
    await runEdit(["--id", "page-1", "--body", "새 본문", "--mime-type", "text/x-markdown"]);

    expect(mocks.resolveWikiPageInput).toHaveBeenCalledWith(
      mocks.client,
      expect.objectContaining({ idOpt: "page-1", projectArg: undefined, pageIdArg: undefined }),
    );
  });

  it("--id 와 --project 를 함께 주면 project 로 넘긴다", async () => {
    await runEdit([
      "--id",
      "page-1",
      "--project",
      "my-wiki",
      "--body",
      "새 본문",
      "--mime-type",
      "text/x-markdown",
    ]);

    expect(mocks.resolveWikiPageInput).toHaveBeenCalledWith(
      mocks.client,
      expect.objectContaining({ idOpt: "page-1", project: "my-wiki" }),
    );
  });

  it("positional 두 개를 주면 projectArg 와 pageIdArg 로 넘긴다", async () => {
    await runEdit(["my-wiki", "page-1", "--body", "새 본문", "--mime-type", "text/x-markdown"]);

    expect(mocks.resolveWikiPageInput).toHaveBeenCalledWith(
      mocks.client,
      expect.objectContaining({
        projectArg: "my-wiki",
        pageIdArg: "page-1",
        idOpt: undefined,
        urlOpt: undefined,
      }),
    );
  });
});

describe("wiki page edit mimeType 보존", () => {
  it("--body 만 주면 원본을 조회해 text/html 을 유지한다", async () => {
    mocks.client.getWikiPage.mockResolvedValue(page("text/html"));
    const program = await createCommandTree();
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await program.parseAsync([
      "node",
      "dooray",
      "wiki",
      "edit",
      "my-wiki",
      "page-1",
      "--body",
      "<p>새 본문</p>",
    ]);

    expect(mocks.client.getWikiPage).toHaveBeenCalledWith("wiki-1", "page-1");
    expect(mocks.client.updateWikiPageContent).toHaveBeenCalledWith("wiki-1", "page-1", {
      body: { mimeType: "text/html", content: "<p>새 본문</p>" },
    });
    stdout.mockRestore();
  });

  it("--title 과 --body 를 함께 주면 text/html 을 유지한다", async () => {
    mocks.client.getWikiPage.mockResolvedValue(page("text/html"));
    const program = await createCommandTree();
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await program.parseAsync([
      "node",
      "dooray",
      "wiki",
      "edit",
      "my-wiki",
      "page-1",
      "--title",
      "새 제목",
      "--body",
      "<p>새 본문</p>",
    ]);

    expect(mocks.client.updateWikiPage).toHaveBeenCalledWith("wiki-1", "page-1", {
      subject: "새 제목",
      body: { mimeType: "text/html", content: "<p>새 본문</p>" },
    });
    stdout.mockRestore();
  });

  it("--title 만 주면 원본을 조회하지 않는다", async () => {
    const program = await createCommandTree();
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await program.parseAsync([
      "node",
      "dooray",
      "wiki",
      "edit",
      "my-wiki",
      "page-1",
      "--title",
      "새 제목",
    ]);

    expect(mocks.client.getWikiPage).not.toHaveBeenCalled();
    expect(mocks.client.updateWikiPageTitle).toHaveBeenCalledWith("wiki-1", "page-1", {
      subject: "새 제목",
    });
    stdout.mockRestore();
  });

  it("body 가 없는 페이지는 text/x-markdown 으로 폴백한다", async () => {
    mocks.client.getWikiPage.mockResolvedValue(page(undefined));
    mocks.readBodyInput.mockResolvedValue("새 본문");
    const program = await createCommandTree();
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await program.parseAsync([
      "node",
      "dooray",
      "wiki",
      "edit",
      "my-wiki",
      "page-1",
      "--body",
      "새 본문",
    ]);

    expect(mocks.client.updateWikiPageContent).toHaveBeenCalledWith("wiki-1", "page-1", {
      body: { mimeType: "text/x-markdown", content: "새 본문" },
    });
    stdout.mockRestore();
  });

  it("$EDITOR 수정에서 조회한 페이지의 text/html 을 유지한다", async () => {
    mocks.client.getWikiPage.mockResolvedValue(page("text/html"));
    mocks.openInEditor.mockImplementation(async (original: string) => original + "\n추가");
    const program = await createCommandTree();
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await program.parseAsync(["node", "dooray", "wiki", "edit", "my-wiki", "page-1"]);

    const request = mocks.client.updateWikiPage.mock.calls[0]?.[2];
    expect(request.body.mimeType).toBe("text/html");
    stdout.mockRestore();
  });
});

describe("wiki page edit --mime-type", () => {
  it("지정하면 기존 형식 대신 그 값으로 나가고 원본을 조회하지 않는다", async () => {
    mocks.readBodyInput.mockResolvedValue("새 본문");
    const program = await createCommandTree();
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await program.parseAsync([
      "node",
      "dooray",
      "wiki",
      "edit",
      "my-wiki",
      "page-1",
      "--body",
      "새 본문",
      "--mime-type",
      "text/x-markdown",
    ]);

    expect(mocks.client.getWikiPage).not.toHaveBeenCalled();
    expect(mocks.client.updateWikiPageContent).toHaveBeenCalledWith("wiki-1", "page-1", {
      body: { mimeType: "text/x-markdown", content: "새 본문" },
    });
    stdout.mockRestore();
  });

  it("--title 과 함께 지정해도 조회 없이 그 값으로 나간다", async () => {
    const program = await createCommandTree();
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await program.parseAsync([
      "node",
      "dooray",
      "wiki",
      "edit",
      "my-wiki",
      "page-1",
      "--title",
      "새 제목",
      "--body",
      "<p>새 본문</p>",
      "--mime-type",
      "text/html",
    ]);

    expect(mocks.client.getWikiPage).not.toHaveBeenCalled();
    expect(mocks.client.updateWikiPage).toHaveBeenCalledWith("wiki-1", "page-1", {
      subject: "새 제목",
      body: { mimeType: "text/html", content: "<p>새 본문</p>" },
    });
    stdout.mockRestore();
  });

  it("단독 지정하면 $EDITOR 없이 기존 본문을 그대로 두고 형식만 바꾼다", async () => {
    mocks.client.getWikiPage.mockResolvedValue(page("text/html"));
    const program = await createCommandTree();
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await program.parseAsync([
      "node",
      "dooray",
      "wiki",
      "edit",
      "my-wiki",
      "page-1",
      "--mime-type",
      "text/x-markdown",
    ]);

    expect(mocks.openInEditor).not.toHaveBeenCalled();
    expect(mocks.readBodyInput).not.toHaveBeenCalled();
    expect(mocks.client.updateWikiPageContent).toHaveBeenCalledWith("wiki-1", "page-1", {
      body: { mimeType: "text/x-markdown", content: "기존 본문" },
    });
    stdout.mockRestore();
  });

  it("--title 과 함께 단독 지정하면 제목과 형식을 함께 바꾸고 본문은 유지한다", async () => {
    mocks.client.getWikiPage.mockResolvedValue(page("text/x-markdown"));
    const program = await createCommandTree();
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await program.parseAsync([
      "node",
      "dooray",
      "wiki",
      "edit",
      "my-wiki",
      "page-1",
      "--title",
      "새 제목",
      "--mime-type",
      "text/html",
    ]);

    expect(mocks.openInEditor).not.toHaveBeenCalled();
    expect(mocks.client.updateWikiPageTitle).not.toHaveBeenCalled();
    expect(mocks.client.updateWikiPage).toHaveBeenCalledWith("wiki-1", "page-1", {
      subject: "새 제목",
      body: { mimeType: "text/html", content: "기존 본문" },
    });
    stdout.mockRestore();
  });

  it("본문이 없는 페이지에 단독 지정하면 파라미터 오류로 중단한다", async () => {
    mocks.client.getWikiPage.mockResolvedValue(page());
    const program = await createCommandTree();
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await expect(
      program.parseAsync([
        "node",
        "dooray",
        "wiki",
        "edit",
        "my-wiki",
        "page-1",
        "--mime-type",
        "text/html",
      ]),
    ).rejects.toThrow(/본문이 없는 페이지/);

    expect(mocks.client.updateWikiPage).not.toHaveBeenCalled();
    expect(mocks.client.updateWikiPageContent).not.toHaveBeenCalled();
    stdout.mockRestore();
  });

  it("허용하지 않는 값이면 Commander 가 거부한다", async () => {
    const program = await createCommandTree();
    exitOverrideAll(program);

    await expect(
      program.parseAsync([
        "node",
        "dooray",
        "wiki",
        "edit",
        "my-wiki",
        "page-1",
        "--body",
        "새 본문",
        "--mime-type",
        "markdown",
      ]),
    ).rejects.toThrow(/Allowed choices/);
    expect(mocks.client.updateWikiPageContent).not.toHaveBeenCalled();
  });
});

describe("wiki page edit 웹 방식의 본문 형식", () => {
  it("대화형 편집은 기존 형식이 text/x-markdown 이 아니면 편집기를 열기 전에 종료 코드 3 으로 끝난다", async () => {
    mocks.getConfigOrThrow.mockResolvedValue({ apiKey: "", baseUrl: "https://api.dooray.com", authMode: "web", tenantName: "my-org", sessionCookie: "fake-session" });
    const body = { header: { isSuccessful: true, resultCode: 0, resultMessage: "" }, result: { content: { wikiId: "wiki-1", pageId: "page-1", version: 1, root: false, subject: "제목", body: { mimeType: "text/html", content: "<p>x</p>" }, files: [], images: [] } } };
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(body)));
    const program = await createCommandTree();
    await expect(program.parseAsync(["node", "dooray", "wiki", "edit", "my-wiki", "page-1"])).rejects.toMatchObject({ exitCode: 3 });
    expect(mocks.openInEditor).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
