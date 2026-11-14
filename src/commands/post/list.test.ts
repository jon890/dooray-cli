import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import type { Post } from "@/api/post/types.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
import { localOffset } from "../../utils/local-date.js";

const mocks = vi.hoisted(() => ({
  getConfigOrThrow: vi.fn(),
  resolveProject: vi.fn(),
  lookupTagIds: vi.fn(),
  startSpinner: vi.fn(),
  stopSpinner: vi.fn(),
  cache: {
    getMe: vi.fn(),
    setMe: vi.fn(),
    getMembers: vi.fn(),
    setMembers: vi.fn(),
  },
  client: {
    getPosts: vi.fn(),
    getMe: vi.fn(),
    getMemberDetail: vi.fn(),
    searchMembers: vi.fn(),
    getProjectMembers: vi.fn(),
  },
}));

// 멤버 해석은 실제 resolver 를 태우고, 그 아래 캐시와 API 만 가짜로 둔다.
vi.mock("../../cache/store.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../cache/store.js")>();
  return { ...actual, ...mocks.cache };
});

vi.mock("../../config/store.js", () => ({
  getConfigOrThrow: mocks.getConfigOrThrow,
}));

vi.mock("../../api/client.js", () => ({
  DoorayApiClient: vi.fn(function MockDoorayApiClient() {
    return mocks.client;
  }),
}));

vi.mock("../../resolvers/project.js", () => ({
  resolveProject: mocks.resolveProject,
}));

vi.mock("../../resolvers/tag.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../resolvers/tag.js")>();
  return { ...actual, lookupTagIds: mocks.lookupTagIds };
});

vi.mock("../../utils/spinner.js", () => ({
  startSpinner: mocks.startSpinner,
  stopSpinner: mocks.stopSpinner,
}));

function makePost(number: number): Post {
  return {
    id: `post-${number}`,
    subject: `업무 ${number}`,
    number,
    priority: "normal",
    workflowClass: "working",
    workflow: { id: "workflow-1", name: "진행 중" },
    users: {
      from: { type: "member", member: { organizationMemberId: "member-from" } },
      to: [],
      cc: [],
    },
  } as unknown as Post;
}

async function run(args: string[]): Promise<void> {
  vi.resetModules();
  const { postListCommand } = await import("./list.js");
  const program = new Command()
    .name("dooray")
    .option("--json", "JSON 형식으로 출력")
    .option("--quiet", "ID만 출력")
    .option("--no-color", "색상 비활성화");
  const postCommand = new Command("post").description("업무 관련 명령");
  postCommand.addCommand(postListCommand);
  program.addCommand(postCommand);
  program.exitOverride();
  program.configureOutput({ writeErr: () => {} });
  // 옵션 검증 오류는 하위 명령이 낸다. 프로세스를 끝내지 않고 throw 하게 한다.
  postListCommand.exitOverride();
  postListCommand.configureOutput({ writeErr: () => {} });

  const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  try {
    await program.parseAsync(["node", "dooray", "post", "list", ...args]);
  } finally {
    stdout.mockRestore();
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getConfigOrThrow.mockResolvedValue({
    apiKey: "test-api-key",
    baseUrl: "https://example.dooray.com",
  });
  mocks.resolveProject.mockResolvedValue("project-1");
  mocks.lookupTagIds.mockImplementation(async (_client, _projectId, names: string[]) =>
    names.map((n) => `tagid-${n}`),
  );
  mocks.client.getPosts.mockResolvedValue({ result: [makePost(1)], totalCount: 1 });

  mocks.cache.getMe.mockResolvedValue(null);
  mocks.cache.getMembers.mockResolvedValue(null);
  mocks.client.getMe.mockResolvedValue({
    result: { id: MY_ID, name: "홍길동", defaultOrganization: { id: "org-1" } },
  });
  mocks.client.getMemberDetail.mockImplementation(async (id: string) => ({
    result: { id, name: MEMBER_NAMES[id] ?? "" },
  }));
  mocks.client.searchMembers.mockImplementation(async (params: { externalEmailAddresses: string }) => ({
    result: params.externalEmailAddresses === "user@example.com" ? [{ id: EMAIL_ID, name: "김철수" }] : [],
  }));
  mocks.client.getProjectMembers.mockResolvedValue({
    result: Object.keys(MEMBER_NAMES).map((id) => ({ organizationMemberId: id })),
    totalCount: Object.keys(MEMBER_NAMES).length,
  });
});

const MY_ID = "1111222233334444555";
const EMAIL_ID = "2222333344445555666";
const NAME_ID = "3333444455556666777";
const MEMBER_NAMES: Record<string, string> = {
  [MY_ID]: "홍길동",
  [EMAIL_ID]: "김철수",
  [NAME_ID]: "이영희",
};

/** 목록 조회 호출(postNumber 로 상위 업무를 찾는 호출 제외)의 params. */
function listParams(): Record<string, unknown> {
  const calls = mocks.client.getPosts.mock.calls.filter((c) => c[1]?.postNumber == null);
  expect(calls).toHaveLength(1);
  return calls[0][1];
}

async function expectParamError(args: string[]): Promise<void> {
  await expect(run(args)).rejects.toMatchObject({ exitCode: EXIT_PARAM_ERROR });
  expect(mocks.client.getPosts).not.toHaveBeenCalled();
  expect(mocks.resolveProject).not.toHaveBeenCalled();
  // 기간 검증은 스피너보다 먼저 끝난다.
  expect(mocks.startSpinner).not.toHaveBeenCalled();
}

describe("post list --tag", () => {
  it("--tag 를 주지 않으면 tagIds 키 자체가 없고 태그 조회도 하지 않는다", async () => {
    await run(["my-project"]);

    expect(mocks.client.getPosts).toHaveBeenCalledOnce();
    const args = mocks.client.getPosts.mock.calls[0][1];
    expect(args).not.toHaveProperty("tagIds");
    expect(mocks.lookupTagIds).not.toHaveBeenCalled();
  });

  it("--tag 하나면 그 이름의 id 하나가 들어간다", async () => {
    await run(["my-project", "--tag", "긴급"]);

    expect(mocks.lookupTagIds).toHaveBeenCalledWith(expect.anything(), "project-1", ["긴급"]);
    expect(mocks.client.getPosts.mock.calls[0][1].tagIds).toEqual(["tagid-긴급"]);
  });

  it("--tag 를 두 번 주면 두 id 가 모두 들어간다", async () => {
    await run(["my-project", "--tag", "긴급", "--tag", "버그"]);

    expect(mocks.client.getPosts.mock.calls[0][1].tagIds).toEqual(["tagid-긴급", "tagid-버그"]);
  });

  it("--all 과 함께 주면 모든 페이지 호출에 같은 tagIds 가 들어간다", async () => {
    mocks.client.getPosts
      .mockResolvedValueOnce({ result: [makePost(1)], totalCount: 2 })
      .mockResolvedValueOnce({ result: [makePost(2)], totalCount: 2 });

    await run(["my-project", "--tag", "긴급", "--all"]);

    expect(mocks.client.getPosts).toHaveBeenCalledTimes(2);
    for (const call of mocks.client.getPosts.mock.calls) {
      expect(call[1].tagIds).toEqual(["tagid-긴급"]);
    }
    // 이름 조회는 페이지마다가 아니라 한 번만 한다.
    expect(mocks.lookupTagIds).toHaveBeenCalledOnce();
  });
});

describe("post list --from / --to / --cc", () => {
  it("주지 않으면 멤버 id 키가 없다", async () => {
    await run(["my-project"]);

    const args = listParams();
    expect(args).not.toHaveProperty("fromMemberIds");
    expect(args).not.toHaveProperty("toMemberIds");
    expect(args).not.toHaveProperty("ccMemberIds");
  });

  it("me 는 API 키 주인의 id 로 바꾼다", async () => {
    await run(["my-project", "--from", "me"]);

    expect(listParams().fromMemberIds).toEqual([MY_ID]);
    expect(mocks.client.getMe).toHaveBeenCalledOnce();
  });

  it.each([
    ["id", MY_ID, MY_ID],
    ["이메일", "user@example.com", EMAIL_ID],
    ["이름", "이영희", NAME_ID],
  ])("%s 를 organizationMemberId 로 바꾼다", async (_label, value, expected) => {
    await run(["my-project", "--to", value]);

    expect(listParams().toMemberIds).toEqual([expected]);
  });

  it("세 옵션을 함께 주면 각 키에 따로 들어간다", async () => {
    await run(["my-project", "--from", "me", "--to", "이영희", "--cc", "user@example.com"]);

    const args = listParams();
    expect(args.fromMemberIds).toEqual([MY_ID]);
    expect(args.toMemberIds).toEqual([NAME_ID]);
    expect(args.ccMemberIds).toEqual([EMAIL_ID]);
  });

  it("Me·ME 도 me 로 본다", async () => {
    await run(["my-project", "--from", "Me", "--to", "ME"]);

    const args = listParams();
    expect(args.fromMemberIds).toEqual([MY_ID]);
    expect(args.toMemberIds).toEqual([MY_ID]);
    // me 를 여러 번 줘도 내 정보는 한 번만 조회하고, 이름 해석이 아니라 멤버 목록도 받지 않는다.
    expect(mocks.client.getMe).toHaveBeenCalledOnce();
    expect(mocks.client.getProjectMembers).not.toHaveBeenCalled();
  });

  it("빈 캐시에서 이름을 여럿 줘도 멤버 목록은 한 번만 받는다", async () => {
    let cached: { data: unknown; updatedAt: string } | null = null;
    mocks.cache.getMembers.mockImplementation(async () => cached);
    mocks.cache.setMembers.mockImplementation(async (_projectId: string, data: unknown) => {
      cached = { data, updatedAt: new Date().toISOString() };
    });

    await run(["my-project", "--to", "이영희", "--cc", "김철수", "--from", "홍길동"]);

    expect(mocks.client.getProjectMembers).toHaveBeenCalledOnce();
    const args = listParams();
    expect(args.toMemberIds).toEqual([NAME_ID]);
    expect(args.ccMemberIds).toEqual([EMAIL_ID]);
    expect(args.fromMemberIds).toEqual([MY_ID]);
  });

  it("id·이메일만 주면 멤버 목록을 받지 않는다", async () => {
    await run(["my-project", "--to", MY_ID, "--cc", "user@example.com"]);

    expect(mocks.client.getProjectMembers).not.toHaveBeenCalled();
  });

  // 공식 문서에 여러 id 의 결합 규칙이 없다. 조용히 마지막 값을 쓰면 둘 다 걸렸다고 오해한다.
  it.each(["from", "to", "cc"])("--%s 를 두 번 주면 설정·스피너·API 전에 거부한다", async (option) => {
    for (const values of [["me", "이영희"], ["me", "me"]]) {
      await expect(
        run(["my-project", ...values.flatMap((v) => [`--${option}`, v])]),
      ).rejects.toMatchObject({
        exitCode: EXIT_PARAM_ERROR,
        message: expect.stringContaining(`--${option} 는 한 명만 받습니다`),
      });
    }
    expect(mocks.getConfigOrThrow).not.toHaveBeenCalled();
    expect(mocks.startSpinner).not.toHaveBeenCalled();
    expect(mocks.client.getPosts).not.toHaveBeenCalled();
    expect(mocks.client.getMe).not.toHaveBeenCalled();
    expect(mocks.client.getProjectMembers).not.toHaveBeenCalled();
  });

  it.each(["from", "to", "cc"])("--%s 의 빈 값·공백만 있는 값은 설정·스피너·API 전에 거부한다", async (option) => {
    for (const value of ["", " ", "\t  "]) {
      await expect(run(["my-project", `--${option}`, value])).rejects.toMatchObject({
        exitCode: EXIT_PARAM_ERROR,
        message: expect.stringContaining(`--${option} 값이 비어 있습니다`),
      });
    }
    expect(mocks.getConfigOrThrow).not.toHaveBeenCalled();
    expect(mocks.startSpinner).not.toHaveBeenCalled();
    expect(mocks.client.getPosts).not.toHaveBeenCalled();
    expect(mocks.client.getProjectMembers).not.toHaveBeenCalled();
  });

  it("앞뒤 공백은 지우고 해석한다", async () => {
    await run(["my-project", "--from", "  me ", "--to", " 이영희  "]);

    const args = listParams();
    expect(args.fromMemberIds).toEqual([MY_ID]);
    expect(args.toMemberIds).toEqual([NAME_ID]);
  });

  it("찾을 수 없는 멤버면 어느 옵션의 어느 값인지 알리고 목록을 조회하지 않는다", async () => {
    await expect(run(["my-project", "--to", "nobody@example.com"])).rejects.toMatchObject({
      exitCode: EXIT_PARAM_ERROR,
      message: expect.stringContaining("--to 멤버 'nobody@example.com' 조회 실패"),
    });
    expect(mocks.client.getPosts).not.toHaveBeenCalled();
    // 스피너를 띄운 뒤 실패했으므로 실패로 내려야 한다.
    expect(mocks.stopSpinner).toHaveBeenCalledWith(false);
  });
});

describe("post list --parent", () => {
  it("project/번호 는 그 업무의 postId 로 바꿔 parentPostId 에 넣는다", async () => {
    mocks.client.getPosts.mockImplementation(async (_projectId, params) =>
      params?.postNumber === "42"
        ? { result: [{ id: "parent-post-id" }], totalCount: 1 }
        : { result: [makePost(1)], totalCount: 1 },
    );

    await run(["my-project", "--parent", "my-project/42"]);

    expect(listParams().parentPostId).toBe("parent-post-id");
  });

  it.each(["123456789012345", "1234567890123456789"])("15자리 이상 숫자(%s)는 postId 로 보고 그대로 넣는다", async (value) => {
    await run(["my-project", "--parent", value]);

    // 업무 번호로 찾는 호출 없이 목록 조회 한 번만 한다.
    expect(mocks.client.getPosts).toHaveBeenCalledOnce();
    expect(listParams().parentPostId).toBe(value);
  });

  it("14자리 숫자는 업무 번호로 보고 postId 를 찾는다", async () => {
    mocks.client.getPosts.mockImplementation(async (_projectId, params) =>
      params?.postNumber === "12345678901234"
        ? { result: [{ id: "parent-post-id" }], totalCount: 1 }
        : { result: [makePost(1)], totalCount: 1 },
    );

    await run(["my-project", "--parent", "12345678901234"]);

    expect(mocks.client.getPosts).toHaveBeenCalledWith("project-1", { postNumber: "12345678901234" });
    expect(listParams().parentPostId).toBe("parent-post-id");
  });

  it("짧은 숫자는 이 프로젝트의 업무 번호로 보고 postId 를 찾는다", async () => {
    mocks.client.getPosts.mockImplementation(async (_projectId, params) =>
      params?.postNumber === "42"
        ? { result: [{ id: "parent-post-id" }], totalCount: 1 }
        : { result: [makePost(1)], totalCount: 1 },
    );

    await run(["my-project", "--parent", "42"]);

    expect(mocks.client.getPosts).toHaveBeenCalledWith("project-1", { postNumber: "42" });
    expect(listParams().parentPostId).toBe("parent-post-id");
  });

  it("번호에 해당하는 업무가 없으면 목록을 조회하지 않는다", async () => {
    mocks.client.getPosts.mockResolvedValue({ result: [], totalCount: 0 });

    await expect(run(["my-project", "--parent", "42"])).rejects.toMatchObject({
      exitCode: EXIT_PARAM_ERROR,
    });
    expect(mocks.client.getPosts).toHaveBeenCalledOnce();
  });

  it.each([
    ["숫자가 아닌 값", "abc"],
    ["0번", "0"],
    ["번호 없는 project/", "my-project/"],
    ["슬래시가 둘", "my-project/42/1"],
    ["project/0", "my-project/0"],
  ])("%s(%s)는 API·스피너 전에 거부한다", async (_label, value) => {
    await expectParamError(["my-project", "--parent", value]);
  });

  it("주지 않으면 parentPostId 키가 없다", async () => {
    await run(["my-project"]);

    expect(listParams()).not.toHaveProperty("parentPostId");
  });
});

describe("post list --created / --updated", () => {
  const startOffset = localOffset(new Date(2026, 8, 1, 0, 0, 0));
  const endOffset = localOffset(new Date(2026, 8, 30, 23, 59, 59));

  it("날짜만 준 범위는 그 날의 시작과 끝으로 늘려 ISO 로 보낸다", async () => {
    await run(["my-project", "--created", "2026-09-01~2026-09-30"]);

    expect(listParams().createdAt).toBe(
      `2026-09-01T00:00:00${startOffset}~2026-09-30T23:59:59${endOffset}`,
    );
  });

  it("ISO 범위는 그대로 보낸다", async () => {
    await run(["my-project", "--updated", "2026-09-01T09:00:00+09:00~2026-09-01T18:00:00Z"]);

    expect(listParams().updatedAt).toBe("2026-09-01T09:00:00+09:00~2026-09-01T18:00:00Z");
  });

  // 공식 문서에 A~ 형태는 없다. 끝을 채워 문서에 있는 A~B 로 보낸다.
  it("날짜만 준 시작만 있으면 시작은 넓히고 끝은 2999-12-31T23:59:59Z 로 채운다", async () => {
    await run(["my-project", "--created", "2026-09-01~"]);

    expect(listParams().createdAt).toBe(`2026-09-01T00:00:00${startOffset}~2999-12-31T23:59:59Z`);
  });

  it("ISO 시작만 있으면 시작은 그대로 두고 끝을 채운다", async () => {
    await run(["my-project", "--updated", "2026-09-01T09:00:00+09:00~"]);

    expect(listParams().updatedAt).toBe("2026-09-01T09:00:00+09:00~2999-12-31T23:59:59Z");
  });

  it("끝만 준 범위는 서버가 받도록 시작을 1970-01-01 로 채운다", async () => {
    await run(["my-project", "--updated", "~2026-09-30"]);

    expect(listParams().updatedAt).toBe(`1970-01-01T00:00:00Z~2026-09-30T23:59:59${endOffset}`);
  });

  it.each(["prev-1d", "prev-7d", "prev-30d"])("%s 는 그대로 보낸다", async (value) => {
    await run(["my-project", "--created", value]);

    expect(listParams().createdAt).toBe(value);
  });

  it("주지 않으면 createdAt·updatedAt 키가 없다", async () => {
    await run(["my-project"]);

    expect(listParams()).not.toHaveProperty("createdAt");
    expect(listParams()).not.toHaveProperty("updatedAt");
  });

  it.each([
    ["범위가 아닌 날짜 하나", "2026-09-01"],
    ["알 수 없는 값", "abc"],
    ["물결표만", "~"],
    ["물결표 둘", "2026-09-01~2026-09-10~2026-09-20"],
    ["달력에 없는 날짜", "2026-02-31~"],
    ["offset 없는 ISO", "2026-09-01T00:00:00~"],
    ["실재하지 않는 시각", "2026-09-01T25:00:00+09:00~"],
    ["주 단위 prev", "prev-1w"],
    // 서버는 prev-0d 를 오류 없이 0건으로 돌려준다. 빈 결과가 실수를 숨기지 않게 막는다.
    ["0일 prev", "prev-0d"],
    ["0 이 둘인 prev", "prev-00d"],
    ["앞자리가 0 인 prev", "prev-007d"],
    ["뒤집힌 범위", "2026-09-30~2026-09-01"],
    ["시작과 끝이 같은 시각", "2026-09-01T00:00:00+09:00~2026-09-01T00:00:00+09:00"],
    // 날짜만 준 1969-12-31 의 끝(23:59:59)은 UTC 서쪽 시간대에서 1970-01-01 이후가 된다. 시간대와 무관한 값으로 본다.
    ["채운 시작보다 앞선 날짜", "~1969-12-30"],
    ["채운 시작보다 앞선 일시", "~1969-12-31T23:59:59Z"],
    ["채운 시작과 같은 끝", "~1970-01-01T00:00:00Z"],
    ["채운 끝과 같은 시작", "2999-12-31T23:59:59Z~"],
    ["채운 끝보다 뒤인 시작", "3000-01-01T00:00:00Z~"],
    // prev-<N>d 는 앞뒤에 다른 글자가 붙으면 받지 않는다.
    ["앞에 글자가 붙은 prev", "xprev-1d"],
    ["뒤에 글자가 붙은 prev", "prev-1dx"],
    ["앞에 공백이 붙은 prev", " prev-1d"],
    ["뒤에 공백이 붙은 prev", "prev-1d "],
  ])("%s(%s)는 API 를 부르기 전에 거부한다", async (_label, value) => {
    await expectParamError(["my-project", "--created", value]);
  });

  it("--updated 도 같은 검증을 거치고 오류에 옵션 이름을 적는다", async () => {
    await expect(run(["my-project", "--updated", "abc"])).rejects.toThrow(/--updated 값을 읽을 수 없습니다/);
    expect(mocks.client.getPosts).not.toHaveBeenCalled();
  });

  it("--updated 의 시작이 끝보다 뒤면 오류에 --updated 를 적는다", async () => {
    await expect(run(["my-project", "--updated", "2026-09-30~2026-09-01"])).rejects.toMatchObject({
      exitCode: EXIT_PARAM_ERROR,
      message: expect.stringContaining("--updated 의 시작이 끝과 같거나 뒤입니다"),
    });
    expect(mocks.client.getPosts).not.toHaveBeenCalled();
  });

  describe("서머타임이 있는 시간대", () => {
    const originalTz = process.env.TZ;
    afterEach(() => {
      if (originalTz == null) delete process.env.TZ;
      else process.env.TZ = originalTz;
    });

    it("날짜만 준 시작과 끝에 각 날짜의 offset 을 붙인다", async () => {
      process.env.TZ = "America/New_York";

      await run(["my-project", "--created", "2026-01-15~2026-07-15"]);

      expect(listParams().createdAt).toBe("2026-01-15T00:00:00-05:00~2026-07-15T23:59:59-04:00");
    });
  });

  it("같은 날짜 하나로 만든 범위는 그 날 하루라 받는다", async () => {
    await run(["my-project", "--created", "2026-09-01~2026-09-01"]);

    expect(listParams().createdAt).toBe(
      `2026-09-01T00:00:00${startOffset}~2026-09-01T23:59:59${localOffset(new Date(2026, 8, 1, 23, 59, 59))}`,
    );
  });
});

describe("post list --order", () => {
  it("주지 않으면 -createdAt 로 보낸다", async () => {
    await run(["my-project"]);

    expect(listParams().order).toBe("-createdAt");
  });

  it("고른 정렬을 보낸다", async () => {
    await run(["my-project", "--order", "postDueAt"]);

    expect(listParams().order).toBe("postDueAt");
  });

  it("서버가 무시할 값은 API 를 부르기 전에 거부한다", async () => {
    await expect(run(["my-project", "--order", "bogus"])).rejects.toMatchObject({
      code: "commander.invalidArgument",
    });
    expect(mocks.client.getPosts).not.toHaveBeenCalled();
  });
});

describe("post list --page / --size / --all", () => {
  it("주지 않으면 page 0, size 20 으로 한 번 조회한다", async () => {
    await run(["my-project"]);

    expect(listParams()).toMatchObject({ page: 0, size: 20 });
  });

  it("--page·--size 를 숫자로 바꿔 보낸다", async () => {
    await run(["my-project", "--page", "3", "--size", "50"]);

    expect(listParams()).toMatchObject({ page: 3, size: 50 });
  });

  it("--all 은 size 100 으로 page 0 부터 totalCount 를 채울 때까지 조회한다", async () => {
    mocks.client.getPosts
      .mockResolvedValueOnce({ result: [makePost(1), makePost(2)], totalCount: 3 })
      .mockResolvedValueOnce({ result: [makePost(3)], totalCount: 3 });

    // --all 이면 --page·--size 는 쓰지 않는다.
    await run(["my-project", "--all", "--page", "5", "--size", "7"]);

    const calls = mocks.client.getPosts.mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][1]).toMatchObject({ page: 0, size: 100 });
    expect(calls[1][1]).toMatchObject({ page: 1, size: 100 });
  });
});

describe("post list 필터 조합", () => {
  it("기존 옵션과 새 필터를 함께 주면 --all 의 모든 페이지에 같은 조건이 들어간다", async () => {
    mocks.client.getPosts
      .mockResolvedValueOnce({ result: [makePost(1)], totalCount: 2 })
      .mockResolvedValueOnce({ result: [makePost(2)], totalCount: 2 });

    await run([
      "my-project",
      "--subject", "배포",
      "--tag", "긴급",
      "--from", "me",
      "--created", "prev-30d",
      "--order", "-postUpdatedAt",
      "--all",
    ]);

    expect(mocks.client.getPosts).toHaveBeenCalledTimes(2);
    for (const call of mocks.client.getPosts.mock.calls) {
      expect(call[1]).toMatchObject({
        subjects: "배포",
        tagIds: ["tagid-긴급"],
        fromMemberIds: [MY_ID],
        createdAt: "prev-30d",
        order: "-postUpdatedAt",
      });
    }
  });
});
