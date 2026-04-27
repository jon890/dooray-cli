import { describe, it, expect, vi } from "vitest";
import { resolvePostInput } from "./post-input.js";
import { DoorayCliError } from "../utils/errors.js";

vi.mock("./project.js");
vi.mock("./post.js");

import { resolveProject } from "./project.js";
import { resolvePost } from "./post.js";

function makeClient(opts: {
  standalone?: { id: string; projectId: string; projectCode: string; number: number };
}) {
  return {
    getPostStandalone: vi.fn().mockResolvedValue({
      result: opts.standalone
        ? {
            id: opts.standalone.id,
            number: opts.standalone.number,
            project: { id: opts.standalone.projectId, code: opts.standalone.projectCode },
          }
        : { id: "stub", number: 1, project: { id: "p1", code: "stub" } },
    }),
  } as any;
}

describe("resolvePostInput", () => {
  it("--id + --url 동시 → 에러", async () => {
    await expect(
      resolvePostInput(makeClient({}), { idOpt: "1", urlOpt: "https://x.dooray.com/task/to/2" }),
    ).rejects.toBeInstanceOf(DoorayCliError);
  });

  it("--id + positional 동시 → 에러", async () => {
    await expect(
      resolvePostInput(makeClient({}), { idOpt: "1", projectArg: "tc-ocr" }),
    ).rejects.toBeInstanceOf(DoorayCliError);
  });

  it("--url + positional 동시 → 에러", async () => {
    await expect(
      resolvePostInput(makeClient({}), { urlOpt: "https://x.dooray.com/task/to/1", projectArg: "tc-ocr" }),
    ).rejects.toBeInstanceOf(DoorayCliError);
  });

  it("--url 단독 → standalone 호출", async () => {
    const c = makeClient({
      standalone: { id: "999", projectId: "p1", projectCode: "tc-ocr", number: 337 },
    });
    const out = await resolvePostInput(c, {
      urlOpt: "https://x.dooray.com/task/to/999",
    });
    expect(out).toEqual({ projectId: "p1", projectCode: "tc-ocr", postId: "999", postNumber: 337 });
    expect(c.getPostStandalone).toHaveBeenCalledWith("999");
  });

  it("--id 단독 → standalone 호출", async () => {
    const c = makeClient({
      standalone: { id: "999", projectId: "p1", projectCode: "tc-ocr", number: 337 },
    });
    const out = await resolvePostInput(c, { idOpt: "999" });
    expect(out.postId).toBe("999");
    expect(c.getPostStandalone).toHaveBeenCalledWith("999");
  });

  it("positional 1개가 URL이면 standalone", async () => {
    const c = makeClient({
      standalone: { id: "999", projectId: "p1", projectCode: "tc-ocr", number: 337 },
    });
    const out = await resolvePostInput(c, {
      projectArg: "https://x.dooray.com/task/to/999",
    });
    expect(out.postId).toBe("999");
  });

  it("positional 2개 (기존 경로) → resolveProject + resolvePost 호출", async () => {
    vi.mocked(resolveProject).mockResolvedValue("proj-id-abc");
    vi.mocked(resolvePost).mockResolvedValue("post-id-123");

    const c = makeClient({});
    const out = await resolvePostInput(c, { projectArg: "tc-ocr", postNumberArg: "337" });
    expect(out.projectId).toBe("proj-id-abc");
    expect(out.postId).toBe("post-id-123");
    expect(out.projectCode).toBe("tc-ocr");
    expect(out.postNumber).toBe(337);
    expect(resolveProject).toHaveBeenCalledWith(c, "tc-ocr");
    expect(resolvePost).toHaveBeenCalledWith(c, "proj-id-abc", 337);
  });

  it("post-number 비정수 → 에러", async () => {
    await expect(
      resolvePostInput(makeClient({}), { projectArg: "tc-ocr", postNumberArg: "abc" }),
    ).rejects.toBeInstanceOf(DoorayCliError);
  });

  it("--url 형식 오류 → 에러", async () => {
    await expect(
      resolvePostInput(makeClient({}), { urlOpt: "https://other.com/task/to/1" }),
    ).rejects.toBeInstanceOf(DoorayCliError);
  });

  it("입력 전혀 없음 → 안내 에러", async () => {
    await expect(resolvePostInput(makeClient({}), {})).rejects.toThrow(
      /업무를 식별할 정보가 부족합니다/,
    );
  });
});
