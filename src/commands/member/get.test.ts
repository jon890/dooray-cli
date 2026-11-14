import { beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import type { MemberDetail } from "../../api/types.js";
import { DoorayCliError } from "../../utils/errors.js";
import { EXIT_API_ERROR } from "../../utils/exit-codes.js";

const mocks = vi.hoisted(() => ({
  getConfigOrThrow: vi.fn(),
  fetchMemberOrganization: vi.fn(),
  client: {
    getMemberDetail: vi.fn(),
    getMe: vi.fn(),
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

vi.mock("../../resolvers/member-organization.js", () => ({
  fetchMemberOrganization: mocks.fetchMemberOrganization,
}));

const member: MemberDetail = {
  id: "member-1",
  name: "홍길동",
};

async function createCommandTree(): Promise<Command> {
  vi.resetModules();
  const { memberGetCommand } = await import("./get.js");
  const program = new Command()
    .name("dooray")
    .option("--json", "JSON 형식으로 출력")
    .option("--quiet", "ID만 출력")
    .option("--no-color", "색상 비활성화");
  const memberCommand = new Command("member").description("Dooray 멤버 조회");
  memberCommand.addCommand(memberGetCommand);
  program.addCommand(memberCommand);
  program.exitOverride();
  program.configureOutput({ writeErr: () => {} });
  return program;
}

/** stdout 을 가로채 명령을 돌리고 쓰인 문자열 전부를 돌려준다. */
async function run(args: string[]): Promise<string> {
  const program = await createCommandTree();
  const written: string[] = [];
  const stdout = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    written.push(String(chunk));
    return true;
  });
  try {
    await program.parseAsync(["node", "dooray", "member", "get", ...args]);
  } finally {
    stdout.mockRestore();
  }
  return written.join("");
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getConfigOrThrow.mockResolvedValue({
    apiKey: "test-api-key",
    baseUrl: "https://example.dooray.com",
  });
  mocks.client.getMemberDetail.mockResolvedValue({ result: member });
  mocks.client.getMe.mockResolvedValue({ result: { ...member, id: "me-1", name: "나" } });
  mocks.fetchMemberOrganization.mockResolvedValue({
    defaultOrganization: { id: "org-1", name: "두레이" },
    primaryDepartment: { id: null, name: "플랫폼개발팀" },
    positionName: null,
  });
});

describe("member get me", () => {
  it("me 는 getMe 한 번으로 풀고 멤버 상세는 부르지 않는다", async () => {
    const out = await run(["me"]);

    expect(out).toBe("이름: 나\nmember-id: me-1\n");
    expect(mocks.client.getMe).toHaveBeenCalledTimes(1);
    expect(mocks.client.getMemberDetail).not.toHaveBeenCalled();
  });

  it("--json 과 --quiet 은 일반 조회와 같은 모양이다", async () => {
    expect(JSON.parse(await run(["me", "--json"]))).toMatchObject({ id: "me-1", name: "나" });
    expect(await run(["me", "--quiet"])).toBe("me-1\n");
  });

  it("--with-org 는 getMe 로 푼 id 로 소속을 조회한다", async () => {
    await run(["me", "--with-org"]);

    expect(mocks.fetchMemberOrganization).toHaveBeenCalledWith(mocks.client, "me-1");
  });
});

describe("member get", () => {
  it("옵션이 없으면 소속 정보를 조회하지 않는다", async () => {
    const out = await run(["member-1"]);

    expect(out).toBe("이름: 홍길동\nmember-id: member-1\n");
    expect(mocks.fetchMemberOrganization).not.toHaveBeenCalled();
  });

  it("--with-org 를 주면 그 멤버의 소속 정보를 조회해 줄을 더한다", async () => {
    const out = await run(["member-1", "--with-org"]);

    expect(mocks.fetchMemberOrganization).toHaveBeenCalledWith(mocks.client, "member-1");
    expect(out).toBe("이름: 홍길동\n회사: 두레이\n부서: 플랫폼개발팀\nmember-id: member-1\n");
  });

  it("--json --with-org 는 organization 키를 더한다", async () => {
    const out = await run(["member-1", "--json", "--with-org"]);

    expect(JSON.parse(out).organization).toEqual({
      defaultOrganization: { id: "org-1", name: "두레이" },
      primaryDepartment: { id: null, name: "플랫폼개발팀" },
      positionName: null,
    });
  });

  it("--quiet 과 함께 주면 경고만 내고 소속 정보를 조회하지 않는다", async () => {
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    const out = await run(["member-1", "--quiet", "--with-org"]);

    expect(out).toBe("member-1\n");
    expect(stderr.mock.calls.map((c) => String(c[0])).join("")).toContain("--with-org");
    expect(mocks.fetchMemberOrganization).not.toHaveBeenCalled();
    stderr.mockRestore();
  });

  it("소속 정보 조회가 실패하면 EXIT_API_ERROR 로 던지고 아무것도 출력하지 않는다", async () => {
    mocks.fetchMemberOrganization.mockRejectedValue(
      new DoorayCliError("소속 정보를 불러오지 못했습니다: 네트워크 오류", EXIT_API_ERROR),
    );
    const program = await createCommandTree();
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await expect(
      program.parseAsync(["node", "dooray", "member", "get", "member-1", "--with-org"]),
    ).rejects.toMatchObject({ exitCode: EXIT_API_ERROR });
    expect(stdout).not.toHaveBeenCalled();
    stdout.mockRestore();
  });
});
