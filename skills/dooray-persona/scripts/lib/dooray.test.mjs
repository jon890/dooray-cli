import { describe, expect, it, vi } from "vitest";
import {
  classifyInvolvement,
  DoorayCliMissingError,
  getMe,
  getPost,
  listComments,
  listPosts,
  listProjects,
  runDooray,
} from "./dooray.mjs";

const MEMBER_ID = "1234567890123456789";
const OTHER_MEMBER_ID = "9876543210987654321";

/** 실행기 대역. 호출마다 응답 목록의 다음 값을 stdout 으로 돌려주고 인자를 기록한다. */
function fakeExec(...outputs) {
  const calls = [];
  const exec = vi.fn((bin, args, options, callback) => {
    calls.push({ bin, args, options });
    const next = outputs[Math.min(calls.length - 1, outputs.length - 1)];
    if (next instanceof Error) callback(next, "", next.stderr ?? "");
    else callback(null, JSON.stringify(next), "");
  });
  return { exec, calls };
}

describe("classifyInvolvement", () => {
  it("그룹 담당에 포함된 구성원을 담당자로 분류한다", () => {
    const post = {
      users: {
        to: [
          {
            group: {
              members: [{ organizationMemberId: MEMBER_ID }],
            },
          },
        ],
      },
    };

    expect(classifyInvolvement(post, MEMBER_ID)).toEqual({
      authored: false,
      assigned: true,
      cc: false,
      assigneeKind: "group",
    });
  });

  it("개인 담당자를 member로 분류한다", () => {
    const post = {
      users: {
        to: [{ member: { organizationMemberId: MEMBER_ID } }],
      },
    };

    expect(classifyInvolvement(post, MEMBER_ID)).toEqual({
      authored: false,
      assigned: true,
      cc: false,
      assigneeKind: "member",
    });
  });

  it("참조자로만 포함된 구성원은 cc만 참이다", () => {
    const post = {
      users: {
        to: [{ member: { organizationMemberId: OTHER_MEMBER_ID } }],
        cc: [{ member: { organizationMemberId: MEMBER_ID } }],
      },
    };

    expect(classifyInvolvement(post, MEMBER_ID)).toEqual({
      authored: false,
      assigned: false,
      cc: true,
      assigneeKind: "none",
    });
  });

  it("users가 없어도 전부 거짓으로 분류한다", () => {
    expect(classifyInvolvement({}, MEMBER_ID)).toEqual({
      authored: false,
      assigned: false,
      cc: false,
      assigneeKind: "none",
    });
  });
});


describe("runDooray", () => {
  it("셸 없이 인자 배열로 부르고 --json 을 뒤에 붙인다", async () => {
    const { exec, calls } = fakeExec({ ok: true });
    await expect(runDooray(["project", "list"], { exec })).resolves.toEqual({ ok: true });
    expect(calls[0].bin).toBe("dooray");
    expect(calls[0].args).toEqual(["project", "list", "--json"]);
    expect(calls[0].options).not.toHaveProperty("shell");
  });

  it("dooray 가 없으면 설치 안내로 멈춘다", async () => {
    const missing = Object.assign(new Error("spawn dooray ENOENT"), { code: "ENOENT" });
    await expect(runDooray(["project", "list"], { exec: fakeExec(missing).exec })).rejects.toBeInstanceOf(DoorayCliMissingError);
  });

  it("종료 코드와 CLI 의 마지막 안내 줄을 그대로 전한다", async () => {
    const failed = Object.assign(new Error("failed"), { code: 2, stderr: "처리 중\n세션이 끝났거나 쿠키가 틀렸습니다.\n" });
    await expect(runDooray(["post", "list", "p1"], { exec: fakeExec(failed).exec })).rejects.toThrow(
      "dooray post list 실패 (종료 코드 2): 세션이 끝났거나 쿠키가 틀렸습니다.",
    );
  });

  it("JSON 이 아닌 출력은 읽을 수 없다고 알린다", async () => {
    const exec = (bin, args, options, callback) => callback(null, "not json", "");
    await expect(runDooray(["project", "list"], { exec })).rejects.toThrow("--json 출력을 읽을 수 없습니다");
  });
});

describe("수집 호출", () => {
  it("getMe 는 member get me 의 id 를 organizationMemberId 로 낸다", async () => {
    const { exec, calls } = fakeExec({ id: MEMBER_ID, name: "홍길동" });
    await expect(getMe({ exec })).resolves.toEqual({ organizationMemberId: MEMBER_ID, name: "홍길동" });
    expect(calls[0].args).toEqual(["member", "get", "me", "--json"]);
  });

  it("listProjects 는 id·code·name 만 남긴다", async () => {
    const { exec, calls } = fakeExec([{ id: "p1", code: "proj", name: "이름", extra: 1 }]);
    await expect(listProjects({ exec })).resolves.toEqual([{ id: "p1", code: "proj", name: "이름" }]);
    expect(calls[0].args).toEqual(["project", "list", "--json"]);
  });

  it("listPosts 는 100건 미만이 올 때까지 페이지를 넘기고 since 를 --created 로 보낸다", async () => {
    const full = Array.from({ length: 100 }, (_, i) => ({ id: `a${i}`, createdAt: "2026-02-01T00:00:00+09:00" }));
    const { exec, calls } = fakeExec(full, [{ id: "b", createdAt: "2026-01-15T00:00:00+09:00" }]);
    const posts = await listPosts("p1", { since: "2026-01-01", exec });
    expect(posts).toHaveLength(101);
    expect(calls.map((c) => c.args)).toEqual([
      ["post", "list", "p1", "--page", "0", "--size", "100", "--order", "-createdAt", "--created", "2026-01-01~", "--json"],
      ["post", "list", "p1", "--page", "1", "--size", "100", "--order", "-createdAt", "--created", "2026-01-01~", "--json"],
    ]);
  });

  it("listPosts 는 since 보다 오래된 업무에서 멈추고 maxPages 를 지킨다", async () => {
    const page = [{ id: "new", createdAt: "2026-02-01T00:00:00Z" }, { id: "old", createdAt: "2025-01-01T00:00:00Z" }];
    expect(await listPosts("p1", { since: "2026-01-01", exec: fakeExec(page).exec })).toEqual([page[0]]);
    const full = Array.from({ length: 100 }, (_, i) => ({ id: `a${i}`, createdAt: "2026-02-01T00:00:00Z" }));
    const { exec, calls } = fakeExec(full);
    expect(await listPosts("p1", { maxPages: 2, exec })).toHaveLength(200);
    expect(calls).toHaveLength(2);
    expect(calls[0].args).not.toContain("--created");
  });

  it("getPost 는 --id 로, listComments 는 페이지를 넘기며 부른다", async () => {
    const { exec, calls } = fakeExec({ id: "post1", body: { content: "본문" } });
    await expect(getPost("post1", { exec })).resolves.toMatchObject({ id: "post1" });
    expect(calls[0].args).toEqual(["post", "get", "--id", "post1", "--json"]);
    const comments = fakeExec([{ id: "c1" }]);
    await expect(listComments("post1", { exec: comments.exec })).resolves.toEqual([{ id: "c1" }]);
    expect(comments.calls[0].args).toEqual(["post", "comment", "list", "--id", "post1", "--page", "0", "--size", "100", "--json"]);
  });

  it("목록 출력이 배열이 아니면 구조가 바뀐 것으로 보고 멈춘다", async () => {
    await expect(listComments("post1", { exec: fakeExec({}).exec })).rejects.toThrow("배열이 아닙니다");
  });
});
