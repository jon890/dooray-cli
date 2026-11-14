import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import type { StreamListResponse } from "@/api/stream/types.js";
import { DoorayCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
import { cursorToMs, fetchStreams, streamItemAt, streamItemAuthor, streamItemSummary } from "./feed.js";
import { DEFAULT_SIZE, parseSize, PAGING_SIZE, resolveSinceMs } from "./list.js";

const mocks = vi.hoisted(() => ({
  getConfigOrThrow: vi.fn(),
  client: { getStreams: vi.fn() },
}));

vi.mock("../../config/store.js", () => ({ getConfigOrThrow: mocks.getConfigOrThrow }));
vi.mock("../../api/client.js", () => ({
  DoorayApiClient: vi.fn(function MockDoorayApiClient() {
    return mocks.client;
  }),
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
    // 시각이 없는 schedule 은 그 페이지 커서가 since 이후라 남는다.
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

  it("--unread 는 read=false 로 보낸다", async () => {
    const client = fakeClient();
    await fetchStreams(client, { size: 5, read: false });
    expect(client.getStreams).toHaveBeenCalledWith({ size: 5, before: undefined, read: false });
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
