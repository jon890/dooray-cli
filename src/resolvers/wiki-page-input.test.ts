import { describe, it, expect, vi } from "vitest";
import { resolveWikiPageInput } from "./wiki-page-input.js";
import { DoorayCliError } from "../utils/errors.js";
import { EXIT_PARAM_ERROR, EXIT_API_ERROR } from "../utils/exit-codes.js";

vi.mock("./wiki.js");

import { resolveWiki } from "./wiki.js";

const mockResolveWiki = vi.mocked(resolveWiki);

function makeClient(opts: { getWikiPageStandalone?: (pageId: string) => Promise<any> } = {}) {
  return {
    getWikiPageStandalone: opts.getWikiPageStandalone ?? vi.fn(),
  } as any;
}

describe("resolveWikiPageInput", () => {
  it("positional 2개 → resolveWiki + pageId 반환", async () => {
    mockResolveWiki.mockResolvedValue("wiki-100");
    const out = await resolveWikiPageInput(makeClient(), {
      projectArg: "my-project",
      pageIdArg: "456",
    });
    expect(out).toEqual({ wikiId: "wiki-100", pageId: "456" });
    expect(mockResolveWiki).toHaveBeenCalledWith(expect.anything(), "my-project");
  });

  it("--url 단독 → URL parser 결과 그대로", async () => {
    const out = await resolveWikiPageInput(makeClient(), {
      urlOpt: "https://x.dooray.com/wiki/123/456",
    });
    expect(out).toEqual({ wikiId: "123", pageId: "456" });
  });

  it("positional URL → URL parser 결과 그대로", async () => {
    const out = await resolveWikiPageInput(makeClient(), {
      projectArg: "https://x.dooray.com/wiki/123/456",
    });
    expect(out).toEqual({ wikiId: "123", pageId: "456" });
  });

  it("--id + --project → resolveWiki + pageId, getWikiPageStandalone 미호출", async () => {
    mockResolveWiki.mockResolvedValue("wiki-200");
    const getWikiPageStandalone = vi.fn();
    const out = await resolveWikiPageInput(makeClient({ getWikiPageStandalone }), {
      idOpt: "789",
      project: "other-project",
    });
    expect(out).toEqual({ wikiId: "wiki-200", pageId: "789" });
    expect(mockResolveWiki).toHaveBeenCalledWith(expect.anything(), "other-project");
    expect(getWikiPageStandalone).not.toHaveBeenCalled();
  });

  it("--id 단독 → getWikiPageStandalone 한 번 호출 후 응답의 wikiId 반환", async () => {
    const getWikiPageStandalone = vi.fn().mockResolvedValue({ result: { wikiId: "wiki-300" } });
    const out = await resolveWikiPageInput(makeClient({ getWikiPageStandalone }), {
      idOpt: "999",
    });
    expect(out).toEqual({ wikiId: "wiki-300", pageId: "999" });
    expect(getWikiPageStandalone).toHaveBeenCalledTimes(1);
    expect(getWikiPageStandalone).toHaveBeenCalledWith("999");
  });

  it("--id 단독 응답의 wikiId 가 빈 문자열이면 EXIT_API_ERROR", async () => {
    const getWikiPageStandalone = vi.fn().mockResolvedValue({ result: { wikiId: "" } });
    await expect(
      resolveWikiPageInput(makeClient({ getWikiPageStandalone }), { idOpt: "999" }),
    ).rejects.toMatchObject({ exitCode: EXIT_API_ERROR });
  });

  it("--url 단독 → project 없이 결과를 얻고 getWikiPageStandalone 미호출", async () => {
    const getWikiPageStandalone = vi.fn();
    const out = await resolveWikiPageInput(makeClient({ getWikiPageStandalone }), {
      urlOpt: "https://x.dooray.com/wiki/123/456",
    });
    expect(out).toEqual({ wikiId: "123", pageId: "456" });
    expect(getWikiPageStandalone).not.toHaveBeenCalled();
  });

  it("--id + --url 충돌 → EXIT_PARAM_ERROR", async () => {
    await expect(
      resolveWikiPageInput(makeClient(), {
        idOpt: "1",
        urlOpt: "https://x.dooray.com/wiki/123/456",
      }),
    ).rejects.toMatchObject({ exitCode: EXIT_PARAM_ERROR });
  });

  it("--id + positional 동시 사용 → EXIT_PARAM_ERROR", async () => {
    await expect(
      resolveWikiPageInput(makeClient(), {
        idOpt: "1",
        projectArg: "my-project",
      }),
    ).rejects.toMatchObject({ exitCode: EXIT_PARAM_ERROR });
  });

  it("positional 0개 → INPUT_HELP throw", async () => {
    await expect(
      resolveWikiPageInput(makeClient(), {}),
    ).rejects.toBeInstanceOf(DoorayCliError);
  });
});
