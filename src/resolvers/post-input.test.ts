import { describe, it, expect, vi } from "vitest";
import { resolvePostInput, classifyPostInputToken } from "./post-input.js";
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
      resolvePostInput(makeClient({}), { idOpt: "1", projectArg: "my-project" }),
    ).rejects.toBeInstanceOf(DoorayCliError);
  });

  it("--url + positional 동시 → 에러", async () => {
    await expect(
      resolvePostInput(makeClient({}), { urlOpt: "https://x.dooray.com/task/to/1", projectArg: "my-project" }),
    ).rejects.toBeInstanceOf(DoorayCliError);
  });

  it("--url 단독 → standalone 호출", async () => {
    const c = makeClient({
      standalone: { id: "999", projectId: "p1", projectCode: "my-project", number: 337 },
    });
    const out = await resolvePostInput(c, {
      urlOpt: "https://x.dooray.com/task/to/999",
    });
    expect(out).toEqual({ projectId: "p1", projectCode: "my-project", postId: "999", postNumber: 337 });
    expect(c.getPostStandalone).toHaveBeenCalledWith("999");
  });

  it("--id 단독 → standalone 호출", async () => {
    const c = makeClient({
      standalone: { id: "1234567890123456789", projectId: "p1", projectCode: "my-project", number: 337 },
    });
    const out = await resolvePostInput(c, { idOpt: "1234567890123456789" });
    expect(out.postId).toBe("1234567890123456789");
    expect(c.getPostStandalone).toHaveBeenCalledWith("1234567890123456789");
  });

  it("positional 1개가 URL이면 standalone", async () => {
    const c = makeClient({
      standalone: { id: "999", projectId: "p1", projectCode: "my-project", number: 337 },
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
    const out = await resolvePostInput(c, { projectArg: "my-project", postNumberArg: "337" });
    expect(out.projectId).toBe("proj-id-abc");
    expect(out.postId).toBe("post-id-123");
    expect(out.projectCode).toBe("my-project");
    expect(out.postNumber).toBe(337);
    expect(resolveProject).toHaveBeenCalledWith(c, "my-project");
    expect(resolvePost).toHaveBeenCalledWith(c, "proj-id-abc", 337);
  });

  it("post-number 비정수 → 에러", async () => {
    await expect(
      resolvePostInput(makeClient({}), { projectArg: "my-project", postNumberArg: "abc" }),
    ).rejects.toBeInstanceOf(DoorayCliError);
  });

  it("--url 형식 오류 → 에러", async () => {
    await expect(
      resolvePostInput(makeClient({}), { urlOpt: "https://example.com/task/to/1" }),
    ).rejects.toBeInstanceOf(DoorayCliError);
  });

  it("입력 전혀 없음 → 안내 에러", async () => {
    await expect(resolvePostInput(makeClient({}), {})).rejects.toThrow(
      /업무를 식별할 정보가 부족합니다/,
    );
  });

  // Issue #82 — positional 2번째에 19자리 postId 입력 시 --id 안내
  it("positional 2번째가 19자리 postId → --id 안내 에러", async () => {
    await expect(
      resolvePostInput(makeClient({}), {
        projectArg: "my-project",
        postNumberArg: "1234567890123456789",
      }),
    ).rejects.toThrow(/--id/);
  });

  // --id 에 업무 번호(짧은 numeric) → <project> <number> 안내
  it("--id 에 업무 번호(짧은 numeric) → <project> <number> 안내 에러", async () => {
    await expect(
      resolvePostInput(makeClient({}), { idOpt: "337" }),
    ).rejects.toThrow(/<project>/);
  });

  // --id 에 URL → --url 안내
  it("--id 에 URL → --url 안내 에러", async () => {
    await expect(
      resolvePostInput(makeClient({}), { idOpt: "https://x.dooray.com/task/to/1234567890123456789" }),
    ).rejects.toThrow(/--url/);
  });

  // Issue #83 — /project/tasks/{postId} URL → 정상 standalone 호출
  it("positional 1개가 /project/tasks/ URL이면 standalone", async () => {
    const c = makeClient({
      standalone: { id: "1234567890123456789", projectId: "p1", projectCode: "my-project", number: 337 },
    });
    const out = await resolvePostInput(c, {
      projectArg: "https://x.dooray.com/project/tasks/1234567890123456789",
    });
    expect(out.postId).toBe("1234567890123456789");
    expect(c.getPostStandalone).toHaveBeenCalledWith("1234567890123456789");
  });

  // 기존 정상 케이스 회귀 — <project> 337
  it("<project> 337 정상 경로 회귀", async () => {
    vi.mocked(resolveProject).mockResolvedValue("proj-id-abc");
    vi.mocked(resolvePost).mockResolvedValue("post-id-123");
    const c = makeClient({});
    const out = await resolvePostInput(c, { projectArg: "my-project", postNumberArg: "337" });
    expect(out.projectCode).toBe("my-project");
    expect(out.postNumber).toBe(337);
  });
});

describe("classifyPostInputToken", () => {
  it("http(s):// → url", () => {
    expect(classifyPostInputToken("https://x.dooray.com/task/to/123")).toBe("url");
    expect(classifyPostInputToken("http://x.dooray.com/project/tasks/123")).toBe("url");
  });

  it("15자리 이상 numeric → postId", () => {
    expect(classifyPostInputToken("1234567890123456789")).toBe("postId");
    expect(classifyPostInputToken("123456789012345")).toBe("postId");
  });

  it("1~14자리 numeric → postNumber", () => {
    expect(classifyPostInputToken("337")).toBe("postNumber");
    expect(classifyPostInputToken("1")).toBe("postNumber");
    expect(classifyPostInputToken("99999999999999")).toBe("postNumber");
  });

  it("비숫자 문자열 → project", () => {
    expect(classifyPostInputToken("my-project")).toBe("project");
    expect(classifyPostInputToken("abc")).toBe("project");
    expect(classifyPostInputToken("my-project-code")).toBe("project");
  });
});
