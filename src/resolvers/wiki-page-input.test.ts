import { describe, it, expect, vi } from "vitest";
import { resolveWikiPageInput } from "./wiki-page-input.js";
import { DoorayCliError } from "../utils/errors.js";

vi.mock("./wiki.js");

import { resolveWiki } from "./wiki.js";

const mockResolveWiki = vi.mocked(resolveWiki);

function makeClient() {
  return {} as any;
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

  it("--id + --project → resolveWiki + pageId", async () => {
    mockResolveWiki.mockResolvedValue("wiki-200");
    const out = await resolveWikiPageInput(makeClient(), {
      idOpt: "789",
      project: "other-project",
    });
    expect(out).toEqual({ wikiId: "wiki-200", pageId: "789" });
    expect(mockResolveWiki).toHaveBeenCalledWith(expect.anything(), "other-project");
  });

  it("--id + --url 충돌 → throw", async () => {
    await expect(
      resolveWikiPageInput(makeClient(), {
        idOpt: "1",
        urlOpt: "https://x.dooray.com/wiki/123/456",
      }),
    ).rejects.toBeInstanceOf(DoorayCliError);
  });

  it("positional 0개 → INPUT_HELP throw", async () => {
    await expect(
      resolveWikiPageInput(makeClient(), {}),
    ).rejects.toBeInstanceOf(DoorayCliError);
  });
});
