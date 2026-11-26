import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import type { StreamItem, StreamListResponse } from "@/api/stream/types.js";
import { DoorayCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
import {
  cursorToMs,
  fetchStreams,
  streamChangeSourceId,
  streamItemAt,
  streamItemAuthor,
  streamItemSummary,
} from "./feed.js";
import { DEFAULT_SIZE, parseSize, PAGING_SIZE, resolveSinceMs } from "./list.js";

const mocks = vi.hoisted(() => ({
  getConfigOrThrow: vi.fn(),
  client: { getStreams: vi.fn() },
  webClient: { getStreams: vi.fn(), getMemberNameFromList: vi.fn(), getMemberDetail: vi.fn() },
}));

vi.mock("../../config/store.js", () => ({ getConfigOrThrow: mocks.getConfigOrThrow }));
vi.mock("../../api/dooray-client.js", () => ({
  createClient: (config: { authMode?: string }) => (config.authMode === "web" ? mocks.webClient : mocks.client),
}));
vi.mock("../../utils/spinner.js", () => ({ startSpinner: vi.fn(), stopSpinner: vi.fn() }));

const FIXTURE = JSON.parse(
  readFileSync(new URL("./fixtures/streams-pages.json", import.meta.url), "utf8"),
) as { pages: StreamListResponse[] };
const PAGES = FIXTURE.pages;
const [C1, C2] = PAGES.map((p) => String(p.cursor));

/** before 커서에 맞는 페이지를 돌려주는 가짜 API. 실제 서버처럼 직전 커서로 다음 페이지를 찾는다. */
function fakeClient() {
  const getStreams = vi.fn(async (params?: { before?: string }) => {
    if (params?.before == null) return PAGES[0];
    const idx = PAGES.findIndex((p) => String(p.cursor) === params.before);
    return PAGES[idx + 1];
  });
  return { getStreams };
}

function types(items: { type?: string }[]): (string | undefined)[] {
  return items.map((i) => i.type);
}

function streamIdOf(item: StreamItem): string {
  return String((item[item.type!] as { id: string }).id);
}

/** 그 시각의 나노초 커서. 실제 서버 커서와 같은 자릿수다. */
function nsCursor(iso: string): string {
  return `${Date.parse(iso)}000000`;
}

function commentEvent(id: string, createdAt: string): StreamItem {
  return {
    type: "event",
    event: {
      id,
      type: "comment",
      postId: "post-1",
      creator: { type: "member", member: { organizationMemberId: "member-1", name: "홍길동" } },
      body: { mimeType: "text/x-markdown", content: `댓글 ${id}` },
      createdAt,
    },
  };
}

/** 웹 변환이 만든 업무 시스템 기록. `body` 대신 `actions` 가 있다(ADR-083). */
function systemEvent(id: string, createdAt: string, actions: unknown[] = []): StreamItem {
  return {
    type: "event",
    event: {
      read: false,
      id,
      type: "workflow",
      postId: "post-1",
      creator: { type: "member", member: { organizationMemberId: "member-1", name: "홍길동" } },
      createdAt,
      actions,
    },
  };
}

function webCalendar(id: string, at: string, sourceId = "member-a", extra: Record<string, unknown> = {}): StreamItem {
  return {
    type: "calendar",
    calendar: {
      id,
      source: { organizationMemberId: sourceId, type: "member" },
      target: { schedule: { subject: "주간 회의" } },
      action: { type: "schedule_deleted" },
      at,
      ...extra,
    },
  };
}

function webProject(id: string, at: string, sourceId = "member-b", action = "invited"): StreamItem {
  return {
    type: "project",
    project: { id, source: { organizationMemberId: sourceId }, action, actionDetail: { type: action }, at },
  };
}

const STATE_NAMES = {
  before: { names: [{ name: "To do", locale: "en_US" }, { name: "할 일", locale: "ko_KR" }] },
  after: { names: [{ name: "Doing", locale: "en_US" }, { name: "진행 중", locale: "ko_KR" }] },
};

describe("fetchStreams — 페이지 넘기기", () => {
  it("기본은 한 페이지만 받고 다음 커서를 돌려준다", async () => {
    const client = fakeClient();
    const res = await fetchStreams(client, { size: 20 });
    expect(client.getStreams).toHaveBeenCalledTimes(1);
    expect(types(res.items)).toEqual(["post", "event", "schedule"]);
    expect(res.nextCursor).toBe(C1);
    expect(res.truncated).toBe(false);
  });

  it("--before 커서를 그대로 넘긴다", async () => {
    const client = fakeClient();
    const res = await fetchStreams(client, { size: 20, before: C1 });
    expect(client.getStreams).toHaveBeenCalledWith({ size: 20, before: C1, read: undefined });
    expect(types(res.items)).toEqual(["mail", "pageComment"]);
  });

  it("--all 은 응답이 size 보다 적어도 빈 배열이 올 때까지 넘긴다", async () => {
    const client = fakeClient();
    const res = await fetchStreams(client, { size: 20, all: true });
    expect(client.getStreams.mock.calls.map((c) => c[0]?.before)).toEqual([undefined, C1, C2, PAGES[2].cursor]);
    expect(res.items).toHaveLength(7);
    expect(res.nextCursor).toBeUndefined();
  });

  it("--since 는 커서가 그 시각보다 오래되면 멈추고 오래된 원소를 뺀다", async () => {
    const client = fakeClient();
    const sinceMs = Date.parse("2026-11-01T00:00:00+09:00");
    const res = await fetchStreams(client, { size: 20, sinceMs });
    // 셋째 페이지 커서가 since 보다 앞이라 넷째 페이지는 부르지 않는다.
    expect(client.getStreams).toHaveBeenCalledTimes(3);
    // 시각이 없는 schedule 은 첫 페이지(앞쪽 경계가 지금)에 있어 남는다.
    expect(types(res.items)).toEqual(["post", "event", "schedule", "mail", "pageComment"]);
  });

  it("--since 는 커서가 since 를 막 지나도 여유 안이면 다음 페이지를 받는다", async () => {
    // 원소 시각은 최신순에서 수십 초 어긋나, 다음 페이지 앞쪽에 since 이후 원소가 올 수 있다.
    const sinceMs = Date.parse("2026-11-02T10:00:30+09:00");
    const lateItem = {
      type: "event",
      event: { id: "event-late", createdAt: "2026-11-02T10:00:40+09:00" },
    };
    const pages: StreamListResponse[] = [
      { ...PAGES[0], result: PAGES[0].result!.slice(0, 1) },
      { ...PAGES[1], result: [lateItem, ...PAGES[1].result!] },
      PAGES[2],
    ];
    const getStreams = vi.fn(async (params?: { before?: string }) =>
      params?.before == null ? pages[0] : pages[pages.findIndex((p) => String(p.cursor) === params.before) + 1],
    );
    const res = await fetchStreams({ getStreams }, { size: 20, sinceMs });
    // 첫 커서(10:00:00)는 since 보다 30초 앞이지만 여유 안이라 둘째 페이지까지 받는다.
    expect(getStreams).toHaveBeenCalledTimes(2);
    expect(res.items.map((i) => (i[i.type!] as { id: string }).id)).toEqual(["post-1", "event-late"]);
  });

  it("--since 를 넘긴 첫 페이지에서 멈추고, 그 페이지의 시각 없는 원소는 남긴다", async () => {
    // 첫 페이지 커서(10:00)가 since(10:10)보다 앞이다. 그 페이지에는 since 이후 원소도 섞여 있다.
    const client = fakeClient();
    const sinceMs = Date.parse("2026-11-02T10:10:00+09:00");
    const res = await fetchStreams(client, { size: 20, sinceMs });
    expect(client.getStreams).toHaveBeenCalledTimes(1);
    expect(types(res.items)).toEqual(["post", "event", "schedule"]);
  });

  it("--since 가 미래면 첫 페이지의 시각 없는 원소도 뺀다", async () => {
    const client = fakeClient();
    const sinceMs = Date.now() + 24 * 60 * 60 * 1000;
    const res = await fetchStreams(client, { size: 20, sinceMs });
    expect(client.getStreams).toHaveBeenCalledTimes(1);
    expect(res.items).toEqual([]);
  });

  it("--since 여유로 더 받은 페이지의 시각 없는 원소는 뺀다", async () => {
    // 둘째 페이지 커서(12:00:00)가 since(12:00:30)보다 30초 앞이라 여유 안이어서 셋째 페이지를 받는다.
    // 셋째 페이지는 앞쪽 경계(둘째 페이지 커서)부터 since 보다 앞이라 시각 없는 원소를 판단할 근거가 없다.
    const schedule = { type: "schedule", schedule: { id: "schedule-old", subject: "일정" } };
    const pages: StreamListResponse[] = [PAGES[0], PAGES[1], { ...PAGES[2], result: [schedule, ...PAGES[2].result!] }];
    const getStreams = vi.fn(async (params?: { before?: string }) =>
      params?.before == null ? pages[0] : pages[pages.findIndex((p) => String(p.cursor) === params.before) + 1],
    );
    const sinceMs = Date.parse("2026-11-01T12:00:30+09:00");
    const res = await fetchStreams({ getStreams }, { size: 20, sinceMs });
    expect(getStreams).toHaveBeenCalledTimes(3);
    expect(types(res.items)).toEqual(["post", "event", "schedule", "mail", "pageComment"]);
    expect(res.items.map((i) => (i[i.type!] as { id: string }).id)).not.toContain("schedule-old");
  });

  it("--unread 는 read=false 로 보낸다", async () => {
    const client = fakeClient();
    await fetchStreams(client, { size: 5, read: false });
    expect(client.getStreams).toHaveBeenCalledWith({ size: 5, before: undefined, read: false });
  });

  it("withChanges 를 getStreams 에 그대로 넘긴다", async () => {
    const client = fakeClient();
    await fetchStreams(client, { size: 20, withChanges: true });
    expect(client.getStreams).toHaveBeenCalledWith({ size: 20, before: undefined, read: undefined, withChanges: true });
  });

  it("--since 를 줄 때 뺀 변경 기록은 since 이후 것만 세고, 빈 페이지의 건수도 더한다", async () => {
    const sinceMs = Date.parse("2026-11-14T10:00:00+09:00");
    const pages: StreamListResponse[] = [
      {
        header: PAGES[0].header,
        result: [commentEvent("comment-1", "2026-11-14T11:00:00+09:00")],
        cursor: nsCursor("2026-11-14T10:20:00+09:00"),
        changes: [
          webCalendar("calendar-in", "2026-11-14T10:30:00+0900"),
          systemEvent("change-old", "2026-11-14T09:30:00+09:00"),
        ],
        unknown: 1,
      },
      {
        header: PAGES[0].header,
        result: [],
        changes: [webProject("project-in", "2026-11-14T10:10:00+0900")],
        unknown: 2,
      },
    ];
    const getStreams = vi.fn(async (params?: { before?: string }) => (params?.before == null ? pages[0] : pages[1]));
    const res = await fetchStreams({ getStreams }, { size: 20, sinceMs });
    expect(getStreams).toHaveBeenCalledTimes(2);
    expect(res.items.map((i) => streamIdOf(i))).toEqual(["comment-1"]);
    // calendar-in(10:30)과 빈 페이지의 project-in(10:10)만 since 이후다. change-old(09:30)는 세지 않는다.
    expect(res.hiddenChanges).toBe(2);
    expect(res.unknown).toBe(3);
  });

  it("--since 는 커서가 since 이후여도 자기 시각이 앞선 댓글을 빼고, 시각 없는 댓글은 페이지 앞쪽 경계로 판단한다", async () => {
    const sinceMs = Date.parse("2026-11-14T10:00:00+09:00");
    const noTime = { type: "event", event: { id: "comment-no-time", body: { mimeType: "text/x-markdown", content: "x" } } };
    const page: StreamListResponse = {
      header: PAGES[0].header,
      result: [
        commentEvent("comment-new", "2026-11-14T10:05:00+09:00"),
        commentEvent("comment-old", "2026-11-14T09:59:00+09:00"),
        noTime,
      ],
      // 첫 페이지라 앞쪽 경계는 지금이고 since 이후다. 시각 없는 댓글은 남는다.
      cursor: nsCursor("2026-11-14T10:00:00+09:00"),
    };
    const end: StreamListResponse = { header: PAGES[0].header, result: [] };
    const getStreams = vi.fn(async (params?: { before?: string }) => (params?.before == null ? page : end));
    const res = await fetchStreams({ getStreams }, { size: 20, sinceMs });
    expect(res.items.map((i) => streamIdOf(i))).toEqual(["comment-new", "comment-no-time"]);
    expect(res.hiddenChanges).toBe(0);
    expect(res.unknown).toBe(0);
  });

  it("커서가 바뀌지 않으면 같은 페이지를 되풀이하지 않는다", async () => {
    const getStreams = vi.fn(async () => PAGES[0]);
    const res = await fetchStreams({ getStreams }, { size: 20, all: true });
    expect(getStreams).toHaveBeenCalledTimes(2);
    expect(res.items).toHaveLength(6);
  });
});

describe("원소 헬퍼", () => {
  const all = PAGES.flatMap((p) => p.result ?? []);
  const byType = (t: string) => all.find((i) => i.type === t)!;

  it("type 마다 다른 시각 필드를 읽고, 일정 시각은 활동 시각으로 쓰지 않는다", () => {
    expect(streamItemAt(byType("project"))).toBe("2026-10-31T09:30:00+09:00");
    expect(streamItemAt(byType("mail"))).toBe("2026-11-01T13:00:00+09:00");
    expect(streamItemAt(byType("event"))).toBe("2026-11-02T10:30:00+09:00");
    expect(streamItemAt(byType("schedule"))).toBeUndefined();
  });

  it("시각 필드가 여럿이면 가장 늦은 값을 활동 시각으로 쓴다", () => {
    const edited = {
      type: "post",
      post: { id: "post-old", createdAt: "2026-09-01T09:00:00+09:00", updatedAt: "2026-11-02T09:00:00+09:00" },
    };
    expect(streamItemAt(edited)).toBe("2026-11-02T09:00:00+09:00");
  });

  it("작성자는 creator·users.from·actor 에서 이름을 찾는다", () => {
    expect(streamItemAuthor(byType("event"))).toBe("김철수");
    expect(streamItemAuthor(byType("post"))).toBe("홍길동");
    expect(streamItemAuthor(byType("mail"))).toBe("홍길동");
    expect(streamItemAuthor(byType("pageComment"))).toBe("김철수");
    // project 의 actor 는 id 만 있다.
    expect(streamItemAuthor(byType("project"))).toBe("");
  });

  it("제목이 없으면 본문 앞부분을 한 줄로 쓴다", () => {
    expect(streamItemSummary(byType("post"))).toBe("배포 일정 확인");
    expect(streamItemSummary(byType("project"))).toBe("example-project");
    expect(streamItemSummary(byType("event"))).toBe("첫 줄 둘째 줄");
  });

  it("시스템 기록 event 는 actions 를 항목 이름과 바뀐 값으로 요약한다", () => {
    const at = "2026-11-14T10:00:00+09:00";
    const workflow = { name: "workflow", type: "changed", message: "상태: 변경", data: STATE_NAMES };
    const endedAt = { name: "endedAt", message: "마감일: 변경", data: { before: null, after: "2026-11-20T18:00:00+09:00" } };
    const subject = { name: "subject", message: "제목: 변경", data: { before: "회의", after: "주간 회의" } };
    const other = { name: "tag", message: "태그: 추가" };
    expect(streamItemSummary(systemEvent("e1", at, [workflow]))).toBe("상태: 할 일 → 진행 중");
    expect(streamItemSummary(systemEvent("e2", at, [endedAt]))).toBe("마감일: 2026-11-20");
    expect(streamItemSummary(systemEvent("e3", at, [subject]))).toBe("제목: 회의 → 주간 회의");
    expect(streamItemSummary(systemEvent("e4", at, [other]))).toBe("태그: 추가");
    expect(streamItemSummary(systemEvent("e5", at, [workflow, subject]))).toBe("상태: 할 일 → 진행 중, 제목: 회의 → 주간 회의");
  });

  it("상태 이름에 ko_KR 이 없으면 첫 이름을, 값을 읽지 못하면 message 를 쓴다", () => {
    const at = "2026-11-14T10:00:00+09:00";
    const noKo = {
      name: "workflow",
      message: "상태: 변경",
      data: { before: { names: [{ name: "To do", locale: "en_US" }] }, after: { names: [{ name: "Done", locale: "en_US" }] } },
    };
    const noNames = { name: "workflow", message: "상태: 변경", data: { before: {}, after: {} } };
    const badEnd = { name: "endedAt", message: "마감일: 변경", data: { after: null } };
    const badSubject = { name: "subject", message: "제목: 변경", data: { before: "회의" } };
    const noMessage = { name: "milestone" };
    expect(streamItemSummary(systemEvent("e1", at, [noKo]))).toBe("상태: To do → Done");
    expect(streamItemSummary(systemEvent("e2", at, [noNames]))).toBe("상태: 변경");
    expect(streamItemSummary(systemEvent("e3", at, [badEnd]))).toBe("마감일: 변경");
    expect(streamItemSummary(systemEvent("e4", at, [badSubject]))).toBe("제목: 변경");
    expect(streamItemSummary(systemEvent("e5", at, [noMessage]))).toBe("milestone");
  });

  it("pageEvent 는 body.actions 의 message 를 쉼표로 잇는다", () => {
    const pageEvent = {
      type: "pageEvent",
      pageEvent: {
        id: "pageevent-1",
        body: { actions: [{ name: "body", message: "본문 변경" }, { name: "subject", message: "제목 변경" }] },
        createdAt: "2026-11-14T10:00:00+09:00",
        creator: { type: "member", member: { organizationMemberId: "member-1", name: "홍길동" } },
      },
    };
    expect(streamItemSummary(pageEvent)).toBe("본문 변경, 제목 변경");
    expect(streamItemAuthor(pageEvent)).toBe("홍길동");
  });

  it("웹 calendar 는 일정 삭제와 제목을, 모르는 값은 그대로 요약한다", () => {
    const at = "2026-11-14T11:26:36+0900";
    expect(streamItemSummary(webCalendar("c1", at))).toBe("일정 삭제: 주간 회의");
    expect(streamItemSummary(webCalendar("c2", at, "member-a", { target: { schedule: {} } }))).toBe("일정 삭제");
    expect(streamItemSummary(webCalendar("c3", at, "member-a", { action: { type: "schedule_shared" } }))).toBe(
      "schedule_shared",
    );
    expect(streamChangeSourceId(webCalendar("c1", at))).toBe("member-a");
    // 이름은 응답에 없어 헬퍼는 비워 두고 명령이 채운다.
    expect(streamItemAuthor(webCalendar("c1", at))).toBe("");
  });

  it("웹 project 는 초대면 「프로젝트 초대」, 아니면 그 값이다", () => {
    const at = "2026-11-14T11:30:00+0900";
    expect(streamItemSummary(webProject("p1", at))).toBe("프로젝트 초대");
    expect(streamItemSummary(webProject("p2", at, "member-b", "joined"))).toBe("joined");
    expect(streamChangeSourceId(webProject("p1", at))).toBe("member-b");
  });

  it("공개 API project 와 댓글 event 는 기존 요약 그대로다", () => {
    // 공개 API project 는 actor·action: "invited"·name 이 있고 source 가 없다.
    expect(byType("project")).toMatchObject({ project: { action: "invited" } });
    expect(streamItemSummary(byType("project"))).toBe("example-project");
    expect(streamChangeSourceId(byType("project"))).toBeUndefined();
    expect(streamItemSummary(byType("event"))).toBe("첫 줄 둘째 줄");
  });

  it("나노초 커서를 밀리초로 읽는다", () => {
    expect(cursorToMs(C1)).toBe(Date.parse("2026-11-02T10:00:00+09:00"));
    expect(cursorToMs("abc")).toBeUndefined();
  });
});

describe("옵션 검증", () => {
  it("--size 는 1~200 정수다. 페이지를 넘길 때 기본값은 최댓값이다", () => {
    expect(parseSize(undefined)).toBe(DEFAULT_SIZE);
    expect(parseSize(undefined, true)).toBe(PAGING_SIZE);
    expect(parseSize("200")).toBe(200);
    for (const bad of ["0", "201", "1.5", "-1", "x"]) {
      expect(() => parseSize(bad)).toThrow(DoorayCliError);
    }
  });

  it("--since 는 날짜, ISO8601, prev-Nd 를 받는다", () => {
    const now = Date.parse("2026-11-02T12:00:00+09:00");
    expect(resolveSinceMs("prev-1d", now)).toBe(now - 86_400_000);
    expect(resolveSinceMs("2026-11-01T09:00:00+09:00")).toBe(Date.parse("2026-11-01T09:00:00+09:00"));
    expect(Number.isNaN(resolveSinceMs("2026-11-01"))).toBe(false);
    for (const bad of ["prev-0d", "yesterday", "2026-13-01"]) {
      try {
        resolveSinceMs(bad);
        expect.unreachable();
      } catch (e) {
        expect((e as DoorayCliError).exitCode).toBe(EXIT_PARAM_ERROR);
      }
    }
  });
});

describe("stream list 명령 — 출력", () => {
  let stdout: string;
  let stderr: string;

  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    mocks.getConfigOrThrow.mockReset();
    mocks.getConfigOrThrow.mockResolvedValue({ apiKey: "k", baseUrl: "https://api.dooray.com" });
    mocks.client.getStreams.mockImplementation(fakeClient().getStreams);
    stdout = "";
    stderr = "";
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdout += String(chunk);
      return true;
    });
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderr += String(chunk);
      return true;
    });
  });

  async function run(args: string[]): Promise<void> {
    const { streamListCommand } = await import("./list.js");
    const program = new Command().option("--json").option("--quiet");
    const stream = new Command("stream");
    stream.addCommand(streamListCommand);
    program.addCommand(stream);
    await program.parseAsync(["node", "dooray", ...args]);
  }

  it("--json 은 API result 원소를 바꾸지 않고 배열로 낸다", async () => {
    await run(["--json", "stream", "list", "--all"]);
    const printed = JSON.parse(stdout);
    expect(printed).toEqual(PAGES.flatMap((p) => p.result ?? []));
  });

  it("한 페이지만 받으면 다음 커서를 stderr 로 알린다", async () => {
    await run(["--json", "stream", "list"]);
    expect(JSON.parse(stdout)).toHaveLength(3);
    expect(stderr).toContain(`--before ${C1}`);
  });

  it("표는 시각, 타입, 작성자, 제목·내용 열을 낸다", async () => {
    await run(["stream", "list"]);
    expect(stdout).toContain("시각");
    expect(stdout).toContain("2026-11-02 11:00");
    expect(stdout).toContain("배포 일정 확인");
    expect(stdout).toContain("김철수");
  });

  it("잘못된 --size 는 설정을 읽기 전에 종료 코드 3 으로 끝난다", async () => {
    await expect(run(["stream", "list", "--size", "500"])).rejects.toMatchObject({
      exitCode: EXIT_PARAM_ERROR,
    });
    expect(mocks.getConfigOrThrow).not.toHaveBeenCalled();
  });
});

describe("stream list 명령 — 변경 기록", () => {
  let stdout: string;
  let stderr: string;
  /** stdout·stderr 를 쓴 순서. 안내가 출력 뒤에 나오는지 본다. */
  let order: ("out" | "err")[];

  const COMMENT = commentEvent("comment-1", "2026-11-14T11:40:00+09:00");
  const CHANGES: StreamItem[] = [
    webCalendar("calendar-1", "2026-11-14T11:26:36+0900", "member-a"),
    webProject("project-1", "2026-11-14T11:20:00+0900", "member-b"),
    webProject("project-2", "2026-11-14T11:10:00+0900", "member-b"),
  ];
  const CURSOR = nsCursor("2026-11-14T11:00:00+09:00");

  /** 웹 구현처럼 withChanges 면 변경 기록을 result 에, 아니면 changes 에 둔다. */
  function webPage(params?: { withChanges?: boolean }, unknown = 0): StreamListResponse {
    return params?.withChanges
      ? { header: PAGES[0].header, result: [COMMENT, ...CHANGES], cursor: CURSOR, changes: [], unknown }
      : { header: PAGES[0].header, result: [COMMENT], cursor: CURSOR, changes: CHANGES, unknown };
  }

  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    mocks.getConfigOrThrow.mockReset();
    mocks.getConfigOrThrow.mockResolvedValue({ authMode: "web", baseUrl: "https://api.dooray.com" });
    mocks.client.getStreams.mockReset();
    mocks.webClient.getStreams.mockReset();
    mocks.webClient.getMemberNameFromList.mockReset();
    mocks.webClient.getMemberDetail.mockReset();
    mocks.webClient.getStreams.mockImplementation(async (params?: { withChanges?: boolean }) => webPage(params));
    mocks.webClient.getMemberNameFromList.mockImplementation((id: string) => (id === "member-a" ? "이영희" : undefined));
    mocks.webClient.getMemberDetail.mockImplementation(async (id: string) => ({
      header: PAGES[0].header,
      result: { id, name: "박민수" },
    }));
    stdout = "";
    stderr = "";
    order = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdout += String(chunk);
      order.push("out");
      return true;
    });
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderr += String(chunk);
      order.push("err");
      return true;
    });
  });

  async function run(args: string[]): Promise<void> {
    const { streamListCommand } = await import("./list.js");
    const program = new Command().option("--json").option("--quiet");
    const stream = new Command("stream");
    stream.addCommand(streamListCommand);
    program.addCommand(stream);
    await program.parseAsync(["node", "dooray", ...args]);
  }

  function count(text: string, needle: string): number {
    return text.split(needle).length - 1;
  }

  const HIDDEN_NOTICE = "ℹ  변경 기록 3건을 뺐습니다. --with-changes 로 함께 봅니다.\n";
  const NAME_WARNING = "⚠  작성자 이름을 찾지 못해 멤버 id 로 보입니다.\n";

  it("--with-changes 표는 변경 내용과 행위자 이름을 보이고, 목록에 없는 사람만 사람마다 한 번 상세 조회한다", async () => {
    await run(["stream", "list", "--with-changes"]);
    expect(mocks.webClient.getStreams).toHaveBeenCalledWith(expect.objectContaining({ withChanges: true }));
    expect(stdout).toContain("일정 삭제: 주간 회의");
    expect(stdout).toContain("프로젝트 초대");
    expect(stdout).toContain("2026-11-14 11:26");
    expect(stdout).toContain("이영희");
    expect(stdout).toContain("박민수");
    // member-b 는 원소 둘에 나오지만 한 번만 찾는다. member-a 는 목록 이름으로 찾아 상세 조회하지 않는다.
    expect(mocks.webClient.getMemberDetail.mock.calls).toEqual([["member-b"]]);
    expect(stderr).not.toContain("변경 기록");
    expect(stderr).not.toContain(NAME_WARNING);
  });

  it("이름 조회가 실패하면 멤버 id 를 보이고 경고를 한 번 쓴 뒤 성공으로 끝낸다", async () => {
    mocks.webClient.getMemberNameFromList.mockReturnValue(undefined);
    mocks.webClient.getMemberDetail.mockRejectedValue(new Error("boom"));
    await run(["stream", "list", "--with-changes"]);
    expect(stdout).toContain("member-a");
    expect(stdout).toContain("member-b");
    expect(stdout).toContain("프로젝트 초대");
    expect(count(stderr, NAME_WARNING)).toBe(1);
  });

  it("옵션이 없으면 표 출력 뒤에 뺀 변경 기록 건수를 한 번 알린다", async () => {
    await run(["stream", "list"]);
    expect(mocks.webClient.getStreams).toHaveBeenCalledWith(expect.objectContaining({ withChanges: false }));
    expect(stdout).toContain("댓글 comment-1");
    expect(stdout).not.toContain("프로젝트 초대");
    expect(count(stderr, HIDDEN_NOTICE)).toBe(1);
    expect(stderr.endsWith(HIDDEN_NOTICE)).toBe(true);
    expect(order.lastIndexOf("out")).toBeLessThan(order.lastIndexOf("err"));
    // 표에 변경 기록이 없으므로 이름을 찾지 않는다.
    expect(mocks.webClient.getMemberDetail).not.toHaveBeenCalled();
  });

  it("--json 은 안내를 stderr 로만 내고 stdout JSON 에 changes 를 넣지 않는다", async () => {
    await run(["--json", "stream", "list"]);
    expect(JSON.parse(stdout)).toEqual([COMMENT]);
    expect(stdout).not.toContain("changes");
    expect(stdout).not.toContain("calendar-1");
    expect(count(stderr, HIDDEN_NOTICE)).toBe(1);
  });

  it("--json --with-changes 는 이름을 찾지 않고 웹 원소를 그대로 낸다", async () => {
    await run(["--json", "stream", "list", "--with-changes"]);
    expect(JSON.parse(stdout)).toEqual([COMMENT, ...CHANGES]);
    expect(mocks.webClient.getMemberNameFromList).not.toHaveBeenCalled();
    expect(mocks.webClient.getMemberDetail).not.toHaveBeenCalled();
  });

  it("--quiet --with-changes 는 변경 기록 id 도 한 줄씩 낸다", async () => {
    await run(["--quiet", "stream", "list", "--with-changes"]);
    expect(stdout.trim().split("\n")).toEqual(["comment-1", "calendar-1", "project-1", "project-2"]);
    expect(mocks.webClient.getMemberDetail).not.toHaveBeenCalled();
  });

  it("빈 결과에도 뺀 변경 기록과 모르는 항목 건수를 알린다", async () => {
    mocks.webClient.getStreams.mockResolvedValue({ header: PAGES[0].header, result: [], changes: CHANGES, unknown: 2 });
    await run(["stream", "list"]);
    expect(stdout).toContain("조건에 맞는 활동이 없습니다.");
    expect(count(stderr, HIDDEN_NOTICE)).toBe(1);
    expect(count(stderr, "ℹ  웹 응답에 CLI 가 모르는 항목 2건이 있어 뺐습니다.\n")).toBe(1);
  });

  it("공개 API 방식에서 --with-changes 는 경고 한 번 뒤 무시되고 출력은 옵션이 없을 때와 같다", async () => {
    mocks.getConfigOrThrow.mockResolvedValue({ apiKey: "k", baseUrl: "https://api.dooray.com" });
    mocks.client.getStreams.mockImplementation(fakeClient().getStreams);
    await run(["stream", "list"]);
    const plain = stdout;
    const plainErr = stderr;
    stdout = "";
    stderr = "";
    await run(["stream", "list", "--with-changes"]);
    expect(stdout).toBe(plain);
    const warning = "⚠  --with-changes 는 웹 방식에서만 동작합니다. 무시합니다.\n";
    expect(count(stderr, warning)).toBe(1);
    expect(stderr.replace(warning, "")).toBe(plainErr);
    expect(mocks.client.getStreams).not.toHaveBeenCalledWith(expect.objectContaining({ withChanges: true }));
    expect(mocks.webClient.getStreams).not.toHaveBeenCalled();
  });
});
