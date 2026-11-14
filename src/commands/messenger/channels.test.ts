import { beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import type { MessengerChannel } from "@/api/messenger/types.js";
import { buildUntitledLabel } from "./channel-list.js";
import { resolveSince } from "./channels.js";

const mocks = vi.hoisted(() => ({
  // 이름 조회 구간이 예외를 던지는 경로를 만들 때만 채운다. 비어 있으면 실제 구현을 쓴다.
  nameMapError: { current: null as Error | null },
  getConfigOrThrow: vi.fn(),
  ensureMe: vi.fn(),
  startSpinner: vi.fn(),
  stopSpinner: vi.fn(),
  client: {
    getMessengerChannels: vi.fn(),
    getMemberDetail: vi.fn(),
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

vi.mock("../../resolvers/member.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../resolvers/member.js")>();
  return {
    ...actual,
    buildOrganizationMemberNameMap: async (...args: Parameters<typeof actual.buildOrganizationMemberNameMap>) => {
      if (mocks.nameMapError.current) throw mocks.nameMapError.current;
      return actual.buildOrganizationMemberNameMap(...args);
    },
  };
});

vi.mock("../../resolvers/me.js", () => ({
  ensureMe: mocks.ensureMe,
}));

vi.mock("../../utils/spinner.js", () => ({
  startSpinner: mocks.startSpinner,
  stopSpinner: mocks.stopSpinner,
}));

// ANSI escape 시작 바이트. 리터럴로 두면 편집기에서 보이지 않아 escape 표기로 쓴다.
const ESC = "\u001b";

const ME_ID = "1111222233334444555";
const HONG_ID = "2222333344445555666";
const KIM_ID = "3333444455556666777";
const LEE_ID = "4444555566667777888";
const PARK_ID = "9999888877776666555";
const UNKNOWN_ID = "9999999999999999999";
const ENG_ID = "member-eng";
// 걸러지는 방에만 있는 참여자. 이름을 조회하면 안 된다.
const ARCHIVED_ONLY_ID = "member-archived-only";
const HIDDEN_ONLY_ID = "member-hidden-only";
const OLD_ONLY_ID = "member-old-only";

const NAMES: Record<string, string> = {
  [ME_ID]: "나본인",
  [HONG_ID]: "홍길동",
  [KIM_ID]: "김철수",
  [LEE_ID]: "이영희",
  [PARK_ID]: "박민수",
  [ENG_ID]: "John Doe",
};

function participant(id: string) {
  return { type: "member", member: { organizationMemberId: id } };
}

function channel(over: Partial<MessengerChannel> & { id: string }): MessengerChannel {
  return {
    title: "",
    type: "private",
    status: "normal",
    displayed: true,
    archivedAt: null,
    updatedAt: "2026-09-10T10:00:00.000+09:00",
    me: { ...participant(ME_ID), role: "member" },
    users: { participants: [participant(ME_ID)] },
    ...over,
  };
}

// 서버 순서를 일부러 섞어 둔다 — 정렬은 클라이언트 몫이다.
const DM_HONG = channel({
  id: "ch-dm-hong",
  type: "direct",
  updatedAt: "2026-09-18T11:38:11.842+09:00",
  users: { participants: [participant(ME_ID), participant(HONG_ID)] },
});
const TEAM = channel({
  id: "ch-team",
  title: "Dev Team 공지",
  updatedAt: "2026-09-20T09:00:00.000+09:00",
  users: { participants: [participant(ME_ID), participant(HONG_ID), participant(KIM_ID)] },
});
const GROUP_SMALL = channel({
  id: "ch-group-small",
  updatedAt: "2026-09-15T08:00:00.000+09:00",
  users: { participants: [participant(ME_ID), participant(KIM_ID), participant(LEE_ID)] },
});
const ARCHIVED = channel({
  id: "ch-archived",
  title: "보관된 방",
  archivedAt: "2026-08-01T00:00:00.000+09:00",
  updatedAt: "2026-09-21T00:00:00.000+09:00",
});
const SYSTEM = channel({
  id: "ch-system",
  title: "시스템 알림",
  status: "system",
  updatedAt: "2026-09-22T00:00:00.000+09:00",
});
const OLD_DM = channel({
  id: "ch-old-dm",
  type: "direct",
  updatedAt: "2026-08-01T12:00:00.000+09:00",
  users: { participants: [participant(ME_ID), participant(PARK_ID)] },
});

// 나를 뺀 참여자가 다섯 명인 제목 없는 그룹방. 표시명에는 앞 셋만 나온다.
const BIG_GROUP_IDS = [ME_ID, HONG_ID, KIM_ID, LEE_ID, PARK_ID, UNKNOWN_ID];
const BIG_GROUP = channel({
  id: "ch-big-group",
  updatedAt: "2026-09-19T10:00:00.000+09:00",
  users: { participants: BIG_GROUP_IDS.map(participant) },
});

const serverChannels = [DM_HONG, ARCHIVED, OLD_DM, TEAM, SYSTEM, GROUP_SMALL];

/** 팩토리가 채운 키를 아예 없앤 사본. 값이 undefined 인 것과 키가 없는 것은 JSON 에서 다르다. */
function withoutKey(ch: MessengerChannel, key: keyof MessengerChannel): MessengerChannel {
  const copy = { ...ch };
  delete copy[key];
  return copy;
}

// updatedAt 이 없거나 읽을 수 없는 방, status 가 없는 방 (ADR-066 의 결정).
const NO_UPDATED = withoutKey(channel({ id: "ch-no-updated", title: "시각 없는 방" }), "updatedAt");
const BAD_UPDATED = channel({ id: "ch-bad-updated", title: "시각 깨진 방", updatedAt: "not-a-date" });
const NO_STATUS = withoutKey(
  channel({ id: "ch-no-status", title: "상태 없는 방", updatedAt: "2026-09-17T00:00:00.000+09:00" }),
  "status",
);
// 1970 이전 시각은 epoch ms 가 음수다. 읽을 수 없는 시각을 0 으로 두면 이 방보다 앞에 선다.
const PRE_EPOCH = channel({
  id: "ch-pre-epoch",
  title: "아주 오래된 방",
  updatedAt: "1969-12-31T00:00:00.000+09:00",
});

// 숨긴 방(displayed: false). 기본 목록에서 빠지고 --all 로 나온다.
const HIDDEN = channel({
  id: "ch-hidden",
  title: "숨긴 방",
  displayed: false,
  updatedAt: "2026-09-23T00:00:00.000+09:00",
});
const NO_DISPLAYED = withoutKey(
  channel({ id: "ch-no-displayed", title: "표시 여부 없는 방", updatedAt: "2026-09-16T00:00:00.000+09:00" }),
  "displayed",
);

// 공식 문서의 type: me(나와의 대화), bot(봇이 만든 채널).
const ME_ROOM = channel({ id: "ch-me", type: "me", updatedAt: "2026-09-14T00:00:00.000+09:00" });
const BOT_ROOM = channel({
  id: "ch-bot",
  type: "bot",
  updatedAt: "2026-09-13T00:00:00.000+09:00",
  users: { participants: [ME_ID, HONG_ID, KIM_ID, LEE_ID, PARK_ID].map(participant) },
});

/** ANSI 색 코드를 떼고, 셀 값 중 하나가 id 인 표 행의 셀들을 돌려준다. */
function tableRow(out: string, id: string): string[] {
  // eslint-disable-next-line no-control-regex
  const plain = out.replace(/\u001b\[[0-9;]*m/g, "");
  for (const line of plain.split("\n")) {
    const cells = line.split("│").slice(1, -1).map((c) => c.trim());
    if (cells.includes(id)) return cells;
  }
  throw new Error(`표에서 ${id} 행을 찾지 못했다:\n${plain}`);
}

function exitOverrideAll(cmd: Command): void {
  cmd.exitOverride();
  cmd.configureOutput({ writeErr: () => {} });
  cmd.commands.forEach(exitOverrideAll);
}

async function createCommandTree(): Promise<Command> {
  vi.resetModules();
  const { messengerChannelsCommand } = await import("./channels.js");
  const program = new Command()
    .name("dooray")
    .option("--json", "JSON 형식으로 출력")
    .option("--quiet", "ID만 출력")
    .option("--no-color", "색상 비활성화");
  const messengerCommand = new Command("messenger").description("메신저 관련 명령");
  messengerCommand.addCommand(messengerChannelsCommand);
  program.addCommand(messengerCommand);
  return program;
}

let lastStderr = "";

async function run(argv: string[]): Promise<string> {
  const program = await createCommandTree();
  exitOverrideAll(program);
  const chunks: string[] = [];
  const errChunks: string[] = [];
  const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    chunks.push(String(chunk));
    return true;
  });
  const errSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    errChunks.push(String(chunk));
    return true;
  });
  try {
    await program.parseAsync(["node", "dooray", ...argv]);
  } finally {
    spy.mockRestore();
    errSpy.mockRestore();
    lastStderr = errChunks.join("");
  }
  return chunks.join("");
}

async function runJson(argv: string[]): Promise<MessengerChannel[]> {
  return JSON.parse(await run(["--json", ...argv])) as MessengerChannel[];
}

function setServerChannels(list: MessengerChannel[]): void {
  mocks.client.getMessengerChannels.mockResolvedValue({
    header: { isSuccessful: true, resultCode: 0, resultMessage: "" },
    result: list,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.nameMapError.current = null;
  mocks.getConfigOrThrow.mockResolvedValue({
    apiKey: "test-api-key",
    baseUrl: "https://example.dooray.com",
  });
  mocks.ensureMe.mockResolvedValue({ id: ME_ID, name: "나본인", orgId: "<orgId>" });
  setServerChannels(serverChannels);
  mocks.client.getMemberDetail.mockImplementation(async (id: string) => {
    if (!NAMES[id]) throw new Error("not found");
    return {
      header: { isSuccessful: true, resultCode: 0, resultMessage: "" },
      result: { id, name: NAMES[id] },
    };
  });
});

describe("messenger channels — 정렬과 필터", () => {
  it("updatedAt 내림차순으로 정렬하고 보관·비정상 방은 기본으로 뺀다", async () => {
    const result = await runJson(["messenger", "channels"]);
    expect(result.map((c) => c.id)).toEqual([TEAM.id, DM_HONG.id, GROUP_SMALL.id, OLD_DM.id]);
  });

  it("--all 이면 보관·비정상 방도 포함한다", async () => {
    const result = await runJson(["messenger", "channels", "--all"]);
    expect(result.map((c) => c.id)).toEqual([
      SYSTEM.id,
      ARCHIVED.id,
      TEAM.id,
      DM_HONG.id,
      GROUP_SMALL.id,
      OLD_DM.id,
    ]);
  });

  it("--type direct 는 1:1 방만 남긴다", async () => {
    const result = await runJson(["messenger", "channels", "--type", "direct"]);
    expect(result.map((c) => c.id)).toEqual([DM_HONG.id, OLD_DM.id]);
  });

  it("--type private 는 그룹방만 남긴다", async () => {
    const result = await runJson(["messenger", "channels", "--type", "private"]);
    expect(result.map((c) => c.id)).toEqual([TEAM.id, GROUP_SMALL.id]);
  });

  it.each([
    ["me", ME_ROOM.id],
    ["bot", BOT_ROOM.id],
  ])("--type %s 는 그 종류의 방만 남긴다", async (type, id) => {
    setServerChannels([DM_HONG, TEAM, ME_ROOM, BOT_ROOM]);
    const result = await runJson(["messenger", "channels", "--type", type]);
    expect(result.map((c) => c.id)).toEqual([id]);
  });

  it("--type 에 정해진 값 밖을 주면 commander 가 거부한다", async () => {
    await expect(run(["messenger", "channels", "--type", "public"])).rejects.toThrow(
      /Allowed choices/,
    );
    expect(mocks.client.getMessengerChannels).not.toHaveBeenCalled();
  });
});

describe("messenger channels — 숨긴 방(displayed)", () => {
  it("displayed 가 false 인 방은 기본으로 빼고 키가 없는 방은 남긴다", async () => {
    setServerChannels([HIDDEN, NO_DISPLAYED, TEAM]);
    const result = await runJson(["messenger", "channels"]);
    expect(result.map((c) => c.id)).toEqual([TEAM.id, NO_DISPLAYED.id]);
    expect("displayed" in result[1]).toBe(false);
  });

  it("--all 이면 숨긴 방도 포함한다", async () => {
    setServerChannels([HIDDEN, NO_DISPLAYED, TEAM]);
    const result = await runJson(["messenger", "channels", "--all"]);
    expect(result.map((c) => c.id)).toEqual([HIDDEN.id, TEAM.id, NO_DISPLAYED.id]);
  });
});

describe("messenger channels — --since", () => {
  it("YYYY-MM-DD 는 updatedAt 이 그 날 00:00 이후인 방만 남긴다", async () => {
    const result = await runJson(["messenger", "channels", "--since", "2026-09-16"]);
    expect(result.map((c) => c.id)).toEqual([TEAM.id, DM_HONG.id]);
  });

  it("offset 붙은 ISO 는 그 시각 이후(같은 시각 포함)만 남긴다", async () => {
    const result = await runJson([
      "messenger",
      "channels",
      "--since",
      "2026-09-18T11:38:11.842+09:00",
    ]);
    expect(result.map((c) => c.id)).toEqual([TEAM.id, DM_HONG.id]);
  });

  it("offset 이 달라도 시각으로 비교한다", async () => {
    // 2026-09-18T02:39:00Z = 2026-09-18T11:39:00+09:00 → DM_HONG(11:38:11) 은 빠진다
    const result = await runJson(["messenger", "channels", "--since", "2026-09-18T02:39:00Z"]);
    expect(result.map((c) => c.id)).toEqual([TEAM.id]);
  });

  it.each(["2026-09", "2026-02-31", "2026-09-18T25:00:00+09:00", "2026-09-18T10:00:00", "yesterday"])(
    "잘못된 값 %s 은 API 호출 전에 EXIT_PARAM_ERROR 로 거부한다",
    async (value) => {
      await expect(run(["messenger", "channels", "--since", value])).rejects.toSatisfy(
        (err: unknown) => {
          const e = err as { exitCode?: number; message?: string };
          return e.exitCode === 3 && /--since/.test(e.message ?? "");
        },
      );
      expect(mocks.getConfigOrThrow).not.toHaveBeenCalled();
      expect(mocks.client.getMessengerChannels).not.toHaveBeenCalled();
    },
  );

  it("resolveSince 는 날짜를 로컬 00:00:00 으로 늘린다", () => {
    expect(resolveSince("2026-09-16")).toMatch(/^2026-09-16T00:00:00[+-]\d{2}:\d{2}$/);
  });
});

describe("messenger channels — updatedAt·status 가 빠진 방", () => {
  it("updatedAt 이 없거나 읽을 수 없는 방은 정렬에서 맨 뒤로 간다", async () => {
    setServerChannels([NO_UPDATED, OLD_DM, BAD_UPDATED, PRE_EPOCH, TEAM]);
    const result = await runJson(["messenger", "channels"]);
    const ids = result.map((c) => c.id);
    expect(ids.slice(0, 3)).toEqual([TEAM.id, OLD_DM.id, PRE_EPOCH.id]);
    expect(ids.slice(3).sort()).toEqual([NO_UPDATED.id, BAD_UPDATED.id].sort());
  });

  it("--since 를 주면 updatedAt 이 없거나 읽을 수 없는 방은 뺀다", async () => {
    setServerChannels([NO_UPDATED, BAD_UPDATED, TEAM]);
    const result = await runJson(["messenger", "channels", "--since", "2026-09-01"]);
    expect(result.map((c) => c.id)).toEqual([TEAM.id]);
  });

  it("--since 가 1970 이전이어도 updatedAt 을 읽을 수 없는 방은 뺀다", async () => {
    setServerChannels([NO_UPDATED, BAD_UPDATED, PRE_EPOCH]);
    const result = await runJson([
      "messenger",
      "channels",
      "--since",
      "1969-01-01T00:00:00+09:00",
    ]);
    expect(result.map((c) => c.id)).toEqual([PRE_EPOCH.id]);
  });

  it("status 키가 없는 방은 기본 목록에 남고 status 가 system 인 방은 빠진다", async () => {
    setServerChannels([NO_STATUS, SYSTEM, TEAM]);
    const result = await runJson(["messenger", "channels"]);
    expect(result.map((c) => c.id)).toEqual([TEAM.id, NO_STATUS.id]);
    expect("status" in result[1]).toBe(false);
  });

  it("--all 이면 status 가 system 인 방도 남는다", async () => {
    setServerChannels([NO_STATUS, SYSTEM, TEAM]);
    const result = await runJson(["messenger", "channels", "--all"]);
    expect(result.map((c) => c.id)).toEqual([SYSTEM.id, TEAM.id, NO_STATUS.id]);
  });

  it("표에서 updatedAt 이 없는 방의 수정 시각 칸은 비운다", async () => {
    setServerChannels([NO_UPDATED]);
    const out = await run(["messenger", "channels"]);
    expect(out).toContain("시각 없는 방");
    expect(out).toContain(NO_UPDATED.id);
    expect(out).not.toContain("undefined");
  });
});

describe("messenger channels — --search", () => {
  it("제목을 대소문자 무시 부분일치로 찾는다", async () => {
    const result = await runJson(["messenger", "channels", "--search", "dev team"]);
    expect(result.map((c) => c.id)).toEqual([TEAM.id]);
  });

  it("제목이 빈 1:1 방을 상대 이름으로 찾는다", async () => {
    const result = await runJson(["messenger", "channels", "--search", "홍길"]);
    expect(result.map((c) => c.id)).toEqual([DM_HONG.id]);
  });

  it("제목이 빈 그룹방을 참여자 이름으로 찾는다", async () => {
    const result = await runJson(["messenger", "channels", "--search", "이영희"]);
    expect(result.map((c) => c.id)).toEqual([GROUP_SMALL.id]);
  });

  it("내 이름으로는 제목 없는 방이 걸리지 않는다 (표시명에서 나를 뺀다)", async () => {
    const result = await runJson(["messenger", "channels", "--search", "나본인"]);
    expect(result).toEqual([]);
  });

  it("--search 가 있으면 --json 에서도 제목 없는 방의 참여자만 조회한다", async () => {
    await runJson(["messenger", "channels", "--search", "홍길"]);
    const looked = mocks.client.getMemberDetail.mock.calls.map((c) => c[0]).sort();
    // TEAM 은 제목이 있어 조회 대상이 아니다. 나는 조회하지 않고, 같은 id 는 한 번만 부른다.
    expect(looked).toEqual([HONG_ID, KIM_ID, LEE_ID, PARK_ID].sort());
  });

  it("영문 이름도 대소문자를 무시하고 찾는다", async () => {
    const engDm = channel({
      id: "ch-dm-eng",
      type: "direct",
      users: { participants: [ME_ID, ENG_ID].map(participant) },
    });
    setServerChannels([engDm, DM_HONG]);
    expect((await runJson(["messenger", "channels", "--search", "jOHN"])).map((c) => c.id)).toEqual([
      engDm.id,
    ]);
    expect((await runJson(["messenger", "channels", "--search", "doe"])).map((c) => c.id)).toEqual([
      engDm.id,
    ]);
  });

  it("제목 검색도 검색어의 대소문자를 무시한다", async () => {
    const result = await runJson(["messenger", "channels", "--search", "DEV TEAM"]);
    expect(result.map((c) => c.id)).toEqual([TEAM.id]);
  });

  it("--json 출력에는 표시명을 끼워넣지 않는다", async () => {
    const result = await runJson(["messenger", "channels", "--search", "홍길"]);
    expect(result[0]).toEqual(DM_HONG);
  });
});

describe("messenger channels — --search 대상과 경고", () => {
  it("표시명에 나오지 않는 4번째 이후 참여자로도 찾는다", async () => {
    setServerChannels([BIG_GROUP]);
    const result = await runJson(["messenger", "channels", "--search", "박민"]);
    expect(result.map((c) => c.id)).toEqual([BIG_GROUP.id]);
  });

  it.each(["확인", "외", "DM", "그룹", "(나)"])(
    "CLI 가 만든 문구 %s 로는 걸리지 않는다",
    async (word) => {
      const selfOnly = channel({ id: "ch-self", type: "direct" });
      const unknownDm = channel({
        id: "ch-unknown-dm",
        type: "direct",
        users: { participants: [ME_ID, UNKNOWN_ID].map(participant) },
      });
      setServerChannels([BIG_GROUP, DM_HONG, selfOnly, unknownDm]);
      const result = await runJson(["messenger", "channels", "--search", word]);
      expect(result).toEqual([]);
    },
  );

  it("이름 조회에 실패한 참여자 수를 stderr 로 알린다", async () => {
    setServerChannels([BIG_GROUP]);
    await run(["--json", "messenger", "channels", "--search", "홍길"]);
    expect(lastStderr).toMatch(/참여자 1명의 이름을 확인하지 못해/);
  });

  it("모두 조회되면 경고하지 않는다", async () => {
    await run(["--json", "messenger", "channels", "--search", "홍길"]);
    expect(lastStderr).not.toMatch(/확인하지 못해/);
  });

  it.each(["", "   "])("빈 검색어 %j 는 API 호출 전에 EXIT_PARAM_ERROR 로 거부한다", async (word) => {
    await expect(run(["messenger", "channels", "--search", word])).rejects.toSatisfy(
      (err: unknown) => (err as { exitCode?: number }).exitCode === 3,
    );
    expect(mocks.getConfigOrThrow).not.toHaveBeenCalled();
    expect(mocks.client.getMessengerChannels).not.toHaveBeenCalled();
  });

  it("검색어 앞뒤 공백은 뗀다", async () => {
    const result = await runJson(["messenger", "channels", "--search", "  홍길동  "]);
    expect(result.map((c) => c.id)).toEqual([DM_HONG.id]);
  });
});

describe("messenger channels — 이름 조회 시점", () => {
  it("--json 에 --search 가 없으면 멤버를 조회하지 않는다", async () => {
    await runJson(["messenger", "channels"]);
    expect(mocks.client.getMemberDetail).not.toHaveBeenCalled();
    expect(mocks.ensureMe).not.toHaveBeenCalled();
  });

  it("--quiet 에 --search 가 없으면 멤버를 조회하지 않고 id 만 낸다", async () => {
    const out = await run(["--quiet", "messenger", "channels"]);
    expect(out).toBe([TEAM.id, DM_HONG.id, GROUP_SMALL.id, OLD_DM.id].join("\n") + "\n");
    expect(mocks.client.getMemberDetail).not.toHaveBeenCalled();
  });

  it("목록의 me 가 있으면 내 정보를 따로 조회하지 않는다", async () => {
    await run(["messenger", "channels"]);
    expect(mocks.ensureMe).not.toHaveBeenCalled();
  });

  it("나는 조회하지 않는다", async () => {
    await run(["messenger", "channels"]);
    await run(["--json", "messenger", "channels", "--search", "홍"]);
    const looked = mocks.client.getMemberDetail.mock.calls.map((c) => c[0]);
    expect(looked).not.toContain(ME_ID);
  });

  it("표 모드에서 --search 가 없으면 방마다 앞 3명만 조회한다", async () => {
    setServerChannels([BIG_GROUP]);
    const out = await run(["messenger", "channels"]);
    const looked = mocks.client.getMemberDetail.mock.calls.map((c) => c[0]).sort();
    expect(looked).toEqual([HONG_ID, KIM_ID, LEE_ID].sort());
    expect(out).toContain("그룹: 홍길동, 김철수, 이영희 외 2명");
  });

  it("표 모드에 --search 가 있으면 나를 뺀 모든 참여자를 조회한다", async () => {
    setServerChannels([BIG_GROUP]);
    await run(["messenger", "channels", "--search", "박민"]);
    const looked = mocks.client.getMemberDetail.mock.calls.map((c) => c[0]).sort();
    expect(looked).toEqual([HONG_ID, KIM_ID, LEE_ID, PARK_ID, UNKNOWN_ID].sort());
  });

  it("ensureMe 가 실패해도 목록을 내고 그 방은 나를 빼지 않은 채 보인다", async () => {
    mocks.ensureMe.mockRejectedValue(new Error("boom"));
    setServerChannels([{ ...DM_HONG, me: undefined }, TEAM]);
    const out = await run(["messenger", "channels"]);
    expect(out).toContain("Dev Team 공지");
    expect(out).toContain("DM: 나본인, 홍길동");
    expect(lastStderr).toMatch(/내 정보를 확인하지 못해/);
  });

  it("me 가 빠진 방은 ensureMe 로 얻은 내 id 로 나를 빼서 내 이름으로 검색되지 않는다", async () => {
    const selfOnly = channel({ id: "ch-self", type: "direct", me: undefined });
    setServerChannels([{ ...DM_HONG, me: undefined }, selfOnly]);
    const result = await runJson(["messenger", "channels", "--search", "나본인"]);
    expect(mocks.ensureMe).toHaveBeenCalledTimes(1);
    expect(result).toEqual([]);
    expect(mocks.client.getMemberDetail.mock.calls.map((c) => c[0])).not.toContain(ME_ID);
  });

  it("me 가 빠진 나만 있는 방은 DM: (나) 로 보인다", async () => {
    setServerChannels([channel({ id: "ch-self", type: "direct", me: undefined })]);
    const out = await run(["messenger", "channels"]);
    expect(mocks.ensureMe).toHaveBeenCalledTimes(1);
    expect(tableRow(out, "ch-self")[0]).toBe("DM: (나)");
  });

  it("me 가 빠진 제목 없는 방이 있으면 ensureMe 로 나를 가린다", async () => {
    setServerChannels([{ ...DM_HONG, me: undefined }]);
    const out = await run(["messenger", "channels"]);
    expect(mocks.ensureMe).toHaveBeenCalledTimes(1);
    expect(out).toContain("DM: 홍길동");
  });
});

describe("messenger channels — 걸러진 방의 이름 조회", () => {
  const archivedUntitled = channel({
    id: "ch-archived-untitled",
    archivedAt: "2026-08-01T00:00:00.000+09:00",
    users: { participants: [ME_ID, ARCHIVED_ONLY_ID].map(participant) },
  });
  const hiddenUntitled = channel({
    id: "ch-hidden-untitled",
    displayed: false,
    users: { participants: [ME_ID, HIDDEN_ONLY_ID].map(participant) },
  });
  const oldUntitledDm = channel({
    id: "ch-old-untitled",
    type: "direct",
    updatedAt: "2026-08-01T00:00:00.000+09:00",
    users: { participants: [ME_ID, OLD_ONLY_ID].map(participant) },
  });

  function looked(): string[] {
    return mocks.client.getMemberDetail.mock.calls.map((c) => c[0] as string);
  }

  it("기본 제외(보관·숨김)로 빠진 방의 참여자는 조회하지 않는다", async () => {
    setServerChannels([archivedUntitled, hiddenUntitled, DM_HONG]);
    await run(["messenger", "channels", "--search", "홍"]);
    expect(looked()).toEqual([HONG_ID]);
  });

  it("--type 으로 빠진 방의 참여자는 조회하지 않는다", async () => {
    setServerChannels([oldUntitledDm, GROUP_SMALL]);
    await run(["messenger", "channels", "--type", "private"]);
    expect(looked().sort()).toEqual([KIM_ID, LEE_ID].sort());
  });

  it("--since 로 빠진 방의 참여자는 조회하지 않는다", async () => {
    setServerChannels([oldUntitledDm, DM_HONG]);
    await run(["messenger", "channels", "--since", "2026-09-01"]);
    expect(looked()).toEqual([HONG_ID]);
  });
});

describe("messenger channels — 스피너", () => {
  it("대화방 목록 조회가 실패하면 spinner 를 닫고 오류를 그대로 던진다", async () => {
    const err = new Error("list failed");
    mocks.client.getMessengerChannels.mockRejectedValue(err);
    await expect(run(["messenger", "channels"])).rejects.toBe(err);
    expect(mocks.stopSpinner).toHaveBeenCalledTimes(1);
    expect(mocks.stopSpinner).toHaveBeenCalledWith(false);
  });

  it("이름 조회 구간이 실패하면 spinner 를 닫고 오류를 그대로 던진다", async () => {
    const err = new Error("name lookup failed");
    mocks.nameMapError.current = err;
    await expect(run(["messenger", "channels"])).rejects.toBe(err);
    expect(mocks.stopSpinner).toHaveBeenCalledTimes(1);
    expect(mocks.stopSpinner).toHaveBeenCalledWith(false);
  });
});

describe("messenger channels — 표 출력", () => {
  it("이름·종류·수정 시각·id 열을 낸다", async () => {
    const out = await run(["messenger", "channels"]);
    expect(out).toContain("이름");
    expect(out).toContain("수정 시각");
    expect(out).not.toContain("최근 활동");
    expect(out).toContain("Dev Team 공지");
    expect(out).toContain("DM: 홍길동");
    expect(out).toContain("그룹: 김철수, 이영희");
    // 밀리초가 붙은 +09:00 시각도 offset 과 초를 떼서 보인다
    expect(out).toContain("2026-09-18 11:38");
    expect(out).not.toContain("11:38:11.842");
    expect(out).toContain(DM_HONG.id);
  });

  it("서버 문자열의 control char 를 지운다", async () => {
    setServerChannels([channel({ id: "ch-evil", title: `악성${ESC}[31m방` })]);
    const out = await run(["messenger", "channels"]);
    expect(out).not.toContain(`악성${ESC}`);
    expect(out).toContain("악성?[31m방");
  });

  it("종류 열은 direct·private·me·bot 을 DM·그룹·나와의 대화·봇 으로 보인다", async () => {
    setServerChannels([DM_HONG, TEAM, ME_ROOM, BOT_ROOM]);
    const out = await run(["messenger", "channels"]);
    expect(tableRow(out, DM_HONG.id)[1]).toBe("DM");
    expect(tableRow(out, TEAM.id)[1]).toBe("그룹");
    expect(tableRow(out, ME_ROOM.id)[1]).toBe("나와의 대화");
    expect(tableRow(out, BOT_ROOM.id)[1]).toBe("봇");
  });

  it("제목 없는 me·bot 방은 나와의 대화·봇 표시명으로 보인다", async () => {
    setServerChannels([ME_ROOM, BOT_ROOM]);
    const out = await run(["messenger", "channels"]);
    expect(tableRow(out, ME_ROOM.id)[0]).toBe("나와의 대화");
    expect(tableRow(out, BOT_ROOM.id)[0]).toBe("봇: 홍길동, 김철수, 이영희 외 1명");
  });

  it("문서에 없는 type 은 그룹으로 뭉개지 않고 원문을 sanitize 해서 보인다", async () => {
    const odd = channel({
      id: "ch-odd",
      type: `public${ESC}[31m`,
      users: { participants: [ME_ID, HONG_ID].map(participant) },
    });
    setServerChannels([odd]);
    const out = await run(["messenger", "channels"]);
    expect(out).not.toContain(`public${ESC}`);
    const row = tableRow(out, odd.id);
    expect(row[1]).toBe("public?[31m");
    expect(row[0]).toBe("public?[31m: 홍길동");
  });

  it("수정 시각과 id 열의 control char 도 지운다", async () => {
    // +09:00 형태가 아니면 formatSentAt 이 원문을 그대로 돌려주므로 시각 열도 거쳐야 한다.
    setServerChannels([
      channel({ id: `ch-${ESC}[31mevil`, title: "방", updatedAt: `2026-09-18${ESC}[31m` }),
    ]);
    const out = await run(["messenger", "channels"]);
    // 표 테두리·머리글의 색 코드가 ESC 를 쓰므로 값 주변만 본다.
    expect(out).not.toContain(`2026-09-18${ESC}`);
    expect(out).not.toContain(`ch-${ESC}`);
    expect(out).toContain("2026-09-18?[31m");
    expect(out).toContain("ch-?[31mevil");
  });

  it("--quiet·--json 은 id 와 updatedAt 을 raw 로 낸다", async () => {
    const evil = channel({ id: `ch-${ESC}[31mevil`, title: "방", updatedAt: `2026-09-18${ESC}[31m` });
    setServerChannels([evil]);
    expect(await run(["--quiet", "messenger", "channels"])).toBe(`${evil.id}\n`);
    expect(await runJson(["messenger", "channels"])).toEqual([evil]);
  });
});

describe("messenger channels — 기본 제외 알림", () => {
  it("제외된 방이 있으면 이유별 수를 stderr 로 한 줄 알린다", async () => {
    setServerChannels([TEAM, HIDDEN, ARCHIVED, SYSTEM]);
    await run(["--json", "messenger", "channels"]);
    expect(lastStderr).toBe(
      "ℹ  숨긴 방 1개, 보관된 방 1개, 시스템·삭제 등 status 가 normal 이 아닌 방 1개를 뺐다. --all 로 모두 본다.\n",
    );
  });

  it("제외된 방이 없으면 알리지 않는다", async () => {
    setServerChannels([TEAM, DM_HONG]);
    await run(["--json", "messenger", "channels"]);
    expect(lastStderr).toBe("");
  });

  it("--all 이면 알리지 않는다", async () => {
    setServerChannels([TEAM, HIDDEN, ARCHIVED]);
    await run(["--json", "messenger", "channels", "--all"]);
    expect(lastStderr).toBe("");
  });

  it("--type·--since 로 어차피 빠질 방은 세지 않는다", async () => {
    const hiddenDm = channel({ id: "ch-hidden-dm", type: "direct", displayed: false });
    setServerChannels([TEAM, HIDDEN, hiddenDm]);
    await run(["--json", "messenger", "channels", "--type", "direct"]);
    expect(lastStderr).toBe("ℹ  숨긴 방 1개를 뺐다. --all 로 모두 본다. 찾는 방이 이 안에 있을 수 있다.\n");
    await run(["--json", "messenger", "channels", "--since", "2026-09-25"]);
    expect(lastStderr).toBe("");
  });

  it("결과가 0건이면 찾는 방이 제외된 방 안에 있을 수 있다고 덧붙인다", async () => {
    setServerChannels([HIDDEN]);
    await run(["--quiet", "messenger", "channels", "--search", "숨긴"]);
    expect(lastStderr).toContain("찾는 방이 이 안에 있을 수 있다");
  });

  it("stdout 은 알림과 상관없이 같다 (--json·--quiet)", async () => {
    setServerChannels([TEAM, HIDDEN]);
    expect(await run(["--quiet", "messenger", "channels"])).toBe(`${TEAM.id}\n`);
    expect(await runJson(["messenger", "channels"])).toEqual([TEAM]);
    setServerChannels([HIDDEN]);
    expect(await run(["--quiet", "messenger", "channels"])).toBe("");
  });
});

describe("messenger channels — type·id 가 없는 응답", () => {
  const NO_TYPE = withoutKey(
    channel({ id: "ch-no-type", title: "종류 없는 방" }),
    "type",
  );
  const NO_ID = withoutKey(channel({ id: "x", title: "id 없는 방" }), "id");

  it("type 이 없어도 표가 죽지 않고 종류 칸을 비운다", async () => {
    setServerChannels([NO_TYPE]);
    const out = await run(["messenger", "channels"]);
    expect(tableRow(out, NO_TYPE.id)[1]).toBe("");
  });

  it("제목 없는 방에 type 이 없어도 표시명을 만든다", async () => {
    const untitled = withoutKey(
      channel({ id: "ch-untitled-no-type", users: { participants: [ME_ID, HONG_ID].map(participant) } }),
      "type",
    );
    setServerChannels([untitled]);
    const out = await run(["messenger", "channels"]);
    expect(tableRow(out, untitled.id)[0]).toBe("홍길동");
  });

  it("id 가 없어도 표가 죽지 않고 --quiet 은 그 방을 id 줄에서 뺀다", async () => {
    setServerChannels([NO_ID, TEAM]);
    const out = await run(["messenger", "channels"]);
    expect(out).toContain("id 없는 방");
    expect(await run(["--quiet", "messenger", "channels"])).toBe(`${TEAM.id}\n`);
  });

  it("id 가 없는 제목 없는 방이 둘이어도 표시명이 섞이지 않는다", async () => {
    const a = withoutKey(
      channel({ id: "a", type: "direct", users: { participants: [ME_ID, HONG_ID].map(participant) } }),
      "id",
    );
    const b = withoutKey(
      channel({ id: "b", type: "direct", users: { participants: [ME_ID, KIM_ID].map(participant) } }),
      "id",
    );
    setServerChannels([a, b]);
    const out = await run(["messenger", "channels"]);
    expect(out).toContain("DM: 홍길동");
    expect(out).toContain("DM: 김철수");
  });
});

describe("messenger channels — 0건", () => {
  beforeEach(() => setServerChannels([]));

  it("표 모드는 안내 문구를 낸다", async () => {
    expect(await run(["messenger", "channels"])).toBe("조건에 맞는 대화방이 없습니다.\n");
  });

  it("--quiet 은 아무것도 내지 않는다", async () => {
    expect(await run(["--quiet", "messenger", "channels"])).toBe("");
  });

  it("--json 은 빈 배열을 낸다", async () => {
    expect(JSON.parse(await run(["--json", "messenger", "channels"]))).toEqual([]);
  });
});

describe("buildUntitledLabel", () => {
  const names = new Map(Object.entries(NAMES));

  it("DM 은 상대 이름 하나", () => {
    expect(buildUntitledLabel(DM_HONG, ME_ID, names)).toBe("DM: 홍길동");
  });

  it("그룹은 3명 이하면 모두 나열한다", () => {
    const ch = channel({
      id: "x",
      users: { participants: [ME_ID, HONG_ID, KIM_ID, LEE_ID].map(participant) },
    });
    expect(buildUntitledLabel(ch, ME_ID, names)).toBe("그룹: 홍길동, 김철수, 이영희");
  });

  it("그룹은 3명을 넘으면 '외 N명' 으로 줄인다", () => {
    const ch = channel({
      id: "x",
      users: { participants: [ME_ID, HONG_ID, KIM_ID, LEE_ID, PARK_ID, UNKNOWN_ID].map(participant) },
    });
    // 이름을 못 얻은 참여자도 '외 N명' 에 센다
    expect(buildUntitledLabel(ch, ME_ID, names)).toBe("그룹: 홍길동, 김철수, 이영희 외 2명");
  });

  it("DM 상대 이름 조회에 실패하면 (상대 미확인)", () => {
    const ch = channel({ id: "x", type: "direct", users: { participants: [ME_ID, UNKNOWN_ID].map(participant) } });
    expect(buildUntitledLabel(ch, ME_ID, names)).toBe("DM: (상대 미확인)");
  });

  it("그룹 참여자 이름을 하나도 얻지 못하면 (참여자 미확인)", () => {
    const ch = channel({ id: "x", users: { participants: [ME_ID, UNKNOWN_ID].map(participant) } });
    expect(buildUntitledLabel(ch, ME_ID, names)).toBe("그룹: (참여자 미확인)");
  });

  it("참여자 목록이 없으면 미확인으로 표시한다", () => {
    const ch = channel({ id: "x", type: "direct", users: undefined });
    expect(buildUntitledLabel(ch, ME_ID, names)).toBe("DM: (상대 미확인)");
  });

  it("나만 있는 방은 (나)", () => {
    const ch = channel({ id: "x", type: "direct" });
    expect(buildUntitledLabel(ch, ME_ID, names)).toBe("DM: (나)");
  });

  it("me 방은 참여자와 상관없이 나와의 대화", () => {
    expect(buildUntitledLabel(ME_ROOM, ME_ID, names)).toBe("나와의 대화");
    const withOthers = channel({
      id: "x",
      type: "me",
      users: { participants: [ME_ID, HONG_ID].map(participant) },
    });
    expect(buildUntitledLabel(withOthers, ME_ID, names)).toBe("나와의 대화");
  });

  it("bot 방은 그룹과 같은 규칙에 접두만 봇", () => {
    expect(buildUntitledLabel(BOT_ROOM, ME_ID, names)).toBe("봇: 홍길동, 김철수, 이영희 외 1명");
    const unknownOnly = channel({
      id: "x",
      type: "bot",
      users: { participants: [ME_ID, UNKNOWN_ID].map(participant) },
    });
    expect(buildUntitledLabel(unknownOnly, ME_ID, names)).toBe("봇: (참여자 미확인)");
    expect(buildUntitledLabel(channel({ id: "x", type: "bot" }), ME_ID, names)).toBe("봇: (나)");
  });

  it("문서에 없는 type 은 그룹 규칙에 원문 type 을 접두로 쓴다", () => {
    const ch = channel({
      id: "x",
      type: "public",
      users: { participants: [ME_ID, UNKNOWN_ID].map(participant) },
    });
    expect(buildUntitledLabel(ch, ME_ID, names)).toBe("public: (참여자 미확인)");
  });

  it("실제 조회 실패도 표에서 미확인으로 보인다", async () => {
    mocks.client.getMemberDetail.mockRejectedValue(new Error("boom"));
    setServerChannels([DM_HONG]);
    const out = await run(["messenger", "channels"]);
    expect(out).toContain("DM: (상대 미확인)");
  });
});
