import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FetchMessageObject } from "imapflow";
import type { Config } from "../config/types.js";
import { DoorayCliError } from "../utils/errors.js";

type FakeClient = ReturnType<typeof createFakeClient>;

const mockState = vi.hoisted(() => ({
  client: null as FakeClient | null,
}));

vi.mock("imapflow", () => ({
  ImapFlow: class {
    constructor() {
      if (!mockState.client) {
        throw new Error("fake IMAP client is not configured");
      }
      return mockState.client;
    }
  },
}));

import { getMail, getMailAttachments, resolveUidByMailId, saveToSent } from "./imapClient.js";

const config: Config = {
  version: 1,
  apiKey: "api-key",
  baseUrl: "https://api.dooray.com",
  imapHost: "imap.example.com",
  imapPort: 993,
  imapUsername: "user@example.com",
  imapPassword: "secret",
};

const DOORAY_ID_EPOCH_MS = 1262304000000n;

function makeMailId(wantMs: number, serial = 0n): string {
  return (((BigInt(wantMs) - DOORAY_ID_EPOCH_MS) << 23n) + serial).toString();
}

function makeMessage(
  uid: number,
  internalDateMs: number,
  subject: string,
): FetchMessageObject & { internalDate: Date } {
  const source = Buffer.from(
    [
      `Subject: ${subject}`,
      `From: Sender ${uid} <sender${uid}@example.com>`,
      `To: Receiver <receiver@example.com>`,
      `Date: ${new Date(internalDateMs).toUTCString()}`,
      `Message-ID: <${uid}@example.com>`,
      "",
      `Body ${uid}`,
    ].join("\r\n"),
  );

  return {
    seq: uid,
    uid,
    internalDate: new Date(internalDateMs),
    envelope: {
      subject,
      from: [{ name: `Sender ${uid}`, address: `sender${uid}@example.com` }],
    },
    flags: new Set(["\\Seen"]),
    source,
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

function utcDayStart(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

// imapflow 의 processDateField 가 BEFORE 를 다루는 방식과 같다.
// 정각이 아닌 BEFORE 는 하루 밀려 그 일자까지 결과에 들어온다.
function beforeBoundMs(date: Date): number {
  const bumped = date.toISOString().substring(11) === "00:00:00.000Z"
    ? date
    : new Date(date.getTime() + DAY_MS);
  return utcDayStart(bumped);
}

function internalDateMs(msg: FetchMessageObject): number {
  const value = typeof msg.internalDate === "string"
    ? new Date(msg.internalDate)
    : msg.internalDate;
  return value instanceof Date ? value.getTime() : NaN;
}

function createFakeClient(messages: FetchMessageObject[]) {
  const byUid = new Map(messages.map((msg) => [msg.uid, msg]));
  const lock = { release: vi.fn() };

  return {
    usable: true,
    connect: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
    close: vi.fn(),
    release: lock.release,
    getMailboxLock: vi.fn().mockResolvedValue(lock),
    // 서버가 SINCE/BEFORE 로 거르는 동작을 흉내낸다. 그래야 일자 필터가
    // 후보를 실제로 좁히는지 확인된다.
    search: vi.fn(async (query: Record<string, unknown>): Promise<number[] | false> => {
      const since = query.since instanceof Date ? utcDayStart(query.since) : null;
      const before = query.before instanceof Date ? beforeBoundMs(query.before) : null;
      if (since === null && before === null) return messages.map((msg) => msg.uid);
      return messages
        .filter((msg) => {
          const ms = internalDateMs(msg);
          if (!Number.isFinite(ms)) return true;
          if (since !== null && ms < since) return false;
          if (before !== null && ms >= before) return false;
          return true;
        })
        .map((msg) => msg.uid);
    }),
    fetchOne: vi.fn(async (uid: string): Promise<FetchMessageObject | false> =>
      byUid.get(Number(uid)) ?? false,
    ),
    fetch: vi.fn(async function* (uids: string): AsyncGenerator<FetchMessageObject> {
      for (const uid of String(uids).split(",").filter(Boolean).map(Number)) {
        const msg = byUid.get(uid);
        if (!msg) continue;
        yield msg;
      }
    }),
  };
}

function setClient(messages: FetchMessageObject[]): FakeClient {
  const client = createFakeClient(messages);
  mockState.client = client;
  return client;
}

async function catchError(promise: Promise<unknown>): Promise<DoorayCliError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(DoorayCliError);
    if (error instanceof DoorayCliError) return error;
    throw error;
  }
  throw new Error("예상한 오류가 발생하지 않았다");
}

beforeEach(() => {
  mockState.client = null;
  vi.clearAllMocks();
});

describe("resolveUidByMailId", () => {
  it("정확히 한 후보면 UID 를 반환한다", async () => {
    const baseMs = Date.UTC(2026, 0, 1, 0, 0, 0);
    const messages = [
      makeMessage(101, baseMs - 4000, "before"),
      makeMessage(102, baseMs - 2000, "before-2"),
      makeMessage(103, baseMs, "target"),
      makeMessage(104, baseMs + 3000, "after"),
      makeMessage(105, baseMs + 6000, "after-2"),
    ];
    const client = setClient(messages);
    const mailId = makeMailId(baseMs);

    await expect(resolveUidByMailId(config, mailId, "sent")).resolves.toBe(103);
    expect(client.getMailboxLock).toHaveBeenCalledWith("sent");
    expect(client.search).toHaveBeenCalledOnce();
    expect(client.search).toHaveBeenCalledWith(
      { since: new Date(baseMs - DAY_MS), before: new Date(baseMs + DAY_MS) },
      { uid: true },
    );
    expect(client.fetchOne).not.toHaveBeenCalled();
    expect(client.release).toHaveBeenCalled();
    expect(client.logout).toHaveBeenCalled();
  });

  it("질의에 찾는 시각의 앞뒤 하루를 준다", async () => {
    const baseMs = Date.UTC(2026, 3, 15, 9, 30, 0);
    const client = setClient([makeMessage(10, baseMs, "target")]);

    await expect(resolveUidByMailId(config, makeMailId(baseMs), "INBOX")).resolves.toBe(10);
    const [query] = client.search.mock.calls[0];
    expect(query.since).toEqual(new Date(baseMs - DAY_MS));
    expect(query.before).toEqual(new Date(baseMs + DAY_MS));
    // imapflow 가 정각이 아닌 BEFORE 를 하루 밀어 실제로 받는 것은 UTC 사흘치다.
    expect(beforeBoundMs(query.before as Date) - utcDayStart(query.since as Date))
      .toBe(3 * DAY_MS);
  });

  it("왕복은 search 한 번과 fetch 한 번이다", async () => {
    const baseMs = Date.UTC(2026, 0, 1, 12, 0, 0);
    const messages = Array.from({ length: 10 }, (_, index) =>
      makeMessage(index + 1, baseMs + (index - 5) * 3000, `subject-${index + 1}`),
    );
    const client = setClient(messages);

    await expect(resolveUidByMailId(config, makeMailId(baseMs), "INBOX")).resolves.toBe(6);
    expect(client.search).toHaveBeenCalledOnce();
    expect(client.fetch).toHaveBeenCalledOnce();
    expect(client.fetchOne).not.toHaveBeenCalled();
  });

  it("조회 범위 밖에 있는 같은 초의 메일은 후보에 들어오지 않는다", async () => {
    const baseMs = Date.UTC(2026, 5, 10, 12, 0, 0);
    const client = setClient([
      makeMessage(10, baseMs, "target"),
      makeMessage(20, baseMs - 5 * DAY_MS, "old"),
      makeMessage(30, baseMs + 5 * DAY_MS, "new"),
    ]);

    await expect(resolveUidByMailId(config, makeMailId(baseMs), "INBOX")).resolves.toBe(10);
    expect(client.fetch.mock.calls[0][0]).toBe("10");
  });

  it("후보가 배치 크기를 넘으면 나눠 조회한다", async () => {
    const baseMs = Date.UTC(2026, 0, 15, 12, 0, 0);
    // 같은 UTC 일자 안에 1200통을 둔다. 배치 크기 500 이면 fetch 가 세 번이다.
    const messages = Array.from({ length: 1200 }, (_, index) =>
      makeMessage(index + 1, baseMs + (index - 600) * 10, `subject-${index + 1}`),
    );
    const client = setClient(messages);

    await expect(resolveUidByMailId(config, makeMailId(baseMs), "INBOX"))
      .rejects.toThrow("여러 건");
    expect(client.search).toHaveBeenCalledOnce();
    expect(client.fetch).toHaveBeenCalledTimes(3);
    for (const call of client.fetch.mock.calls) {
      expect(String(call[0]).split(",").length).toBeLessThanOrEqual(500);
    }
  });

  it("후보가 상한을 넘으면 조회하지 않고 대체 조회를 안내한다", async () => {
    const baseMs = Date.UTC(2026, 0, 1);
    const client = setClient([makeMessage(10, baseMs, "target")]);
    client.search.mockResolvedValue(Array.from({ length: 2001 }, (_, index) => index + 1));

    const error = await catchError(resolveUidByMailId(config, makeMailId(baseMs), "INBOX"));
    expect(error.message).toContain("2001통");
    expect(error.message).toContain("상한 2000통");
    expect(error.message).toContain("--search");
    expect(client.fetch).not.toHaveBeenCalled();
    expect(client.release).toHaveBeenCalled();
    expect(client.logout).toHaveBeenCalled();
  });

  it("같은 초에 두 통이면 후보를 모두 보여주고 멈춘다", async () => {
    const baseMs = Date.UTC(2026, 0, 1, 0, 0, 0);
    const messages = [
      makeMessage(201, baseMs - 3000, "before"),
      makeMessage(202, baseMs, "first"),
      makeMessage(203, baseMs, "second"),
      makeMessage(204, baseMs + 3000, "after"),
    ];
    const client = setClient(messages);
    const mailId = makeMailId(baseMs);

    const error = await catchError(resolveUidByMailId(config, mailId, "INBOX"));
    expect(error).toBeInstanceOf(DoorayCliError);
    expect(error.message).toContain("202");
    expect(error.message).toContain("203");
    expect(error.message).toContain("first");
    expect(error.message).toContain("second");
    expect(error.message).toContain(new Date(baseMs).toISOString());
    expect(error.message).toContain("sender202@example.com");
    expect(error.message).toContain("sender203@example.com");
    expect(error.message).toContain("사서함 INBOX");
    expect(error.message).toContain("후보 UID 하나를 골라 다시 조회");
    expect(client.release).toHaveBeenCalled();
    expect(client.logout).toHaveBeenCalled();
  });

  it("맞는 메일이 없으면 대체 조회 안내를 남긴다", async () => {
    const baseMs = Date.UTC(2026, 0, 1, 0, 0, 0);
    const messages = [
      makeMessage(301, baseMs - 5000, "before"),
      makeMessage(302, baseMs - 3000, "before-2"),
      makeMessage(303, baseMs + 4000, "after"),
      makeMessage(304, baseMs + 5000, "after-2"),
    ];
    setClient(messages);
    const mailId = makeMailId(baseMs);

    const error = await catchError(resolveUidByMailId(config, mailId, "INBOX"));
    expect(error).toBeInstanceOf(DoorayCliError);
    expect(error.message).toContain("--search");
    expect(error.message).toContain("다른 폴더로 이동");
    expect(error.message).toContain("받은 메일함(INBOX) 대체 조회");
  });

  it("sent의 모호한 후보는 웹 폴더에서 확인하도록 안내한다", async () => {
    const baseMs = Date.UTC(2026, 0, 1);
    setClient([makeMessage(10, baseMs, "first"), makeMessage(20, baseMs, "second")]);

    const error = await catchError(resolveUidByMailId(config, makeMailId(baseMs), "sent"));

    expect(error.message).toContain("사서함 sent");
    expect(error.message).toContain("메일 웹 화면의 sent 폴더");
    expect(error.message).toContain("제목과 보낸사람으로 메일을 확인");
    expect(error.message).toContain("UID: 10");
    expect(error.message).toContain("UID: 20");
    expect(error.message).not.toContain("UID 하나를 골라 다시 조회");
  });

  it("sent에서 못 찾은 경우 CLI 검색 대신 웹 폴더 확인을 안내한다", async () => {
    setClient([]);

    const error = await catchError(resolveUidByMailId(config, makeMailId(Date.UTC(2026, 0, 1)), "sent"));

    expect(error.message).toContain("사서함 sent");
    expect(error.message).toContain("메일 웹 화면의 sent 폴더");
    expect(error.message).not.toContain("--search");
  });

  it("후보 제목과 발신자의 제어문자로 새 행이나 터미널 명령을 만들지 못한다", async () => {
    const baseMs = Date.UTC(2026, 0, 1);
    const subject = "제목\r\n  UID: 999\x1b[31m\x9b2J\u2028다음 줄";
    const fromName = "보낸사람\n  제목: 위조\x1b]0;title\x07\u2029끝";
    const messages = [
      {
        ...makeMessage(10, baseMs, "first"),
        envelope: { subject, from: [{ name: fromName, address: "sender@example.com" }] },
      },
      makeMessage(20, baseMs, "second"),
    ];
    setClient(messages);

    const error = await catchError(resolveUidByMailId(config, makeMailId(baseMs), "INBOX"));

    expect(error.message).not.toMatch(/[\x00-\x09\x0B-\x1F\x7F-\x9F\u2028\u2029]/);
    expect(error.message.split("\n").filter((line) => line.startsWith("  UID:")))
      .toEqual(["  UID: 10", "  UID: 20"]);
    expect(error.message.split("\n").filter((line) => line.startsWith("  제목:")))
      .toHaveLength(2);
    expect(error.message).toContain("제목??  UID: 999?[31m?2J?다음 줄");
    expect(messages[0].envelope?.subject).toBe(subject);
    expect(messages[0].envelope?.from?.[0].name).toBe(fromName);
  });

  it("sent의 불완전한 날짜 오류도 웹 폴더 확인을 안내한다", async () => {
    const baseMs = Date.UTC(2026, 0, 1);
    const client = setClient([
      makeMessage(9, baseMs, "first"),
      makeMessage(10, baseMs, "second"),
    ]);
    client.fetch.mockImplementation(async function* () {
      yield { seq: 9, uid: 9 } as FetchMessageObject;
    });

    const error = await catchError(resolveUidByMailId(config, makeMailId(baseMs), "sent"));

    expect(error.message).toContain("메일 웹 화면의 sent 폴더");
    expect(error.message).not.toContain("--search");
    expect(error.message).not.toContain("UID 하나를 골라 다시 조회");
  });

  it("4000통 사서함에서도 왕복은 두 번에 머문다", async () => {
    const baseMs = Date.UTC(2026, 0, 1, 0, 0, 0);
    // 10분에 한 통씩 약 28일치다. 조회 범위 사흘에는 그중 약 432통만 들어온다.
    const messages = Array.from({ length: 4000 }, (_, index) =>
      makeMessage(index + 1, baseMs + index * 600000, `subject-${index + 1}`),
    );
    const client = setClient(messages);
    const target = messages[2345];
    const mailId = makeMailId(target.internalDate.getTime());

    await expect(resolveUidByMailId(config, mailId, "INBOX")).resolves.toBe(2346);
    // 사서함 크기가 아니라 조회 범위의 후보 수가 왕복을 정한다.
    expect(client.fetchOne).not.toHaveBeenCalled();
    expect(client.search).toHaveBeenCalledOnce();
    expect(client.fetch).toHaveBeenCalledOnce();
    expect(client.fetch.mock.calls[0][0].split(",").length).toBeLessThan(messages.length);
  });

  it("초 경계를 넘은 도착 시각과 문자열 날짜를 처리한다", async () => {
    const baseMs = Date.UTC(2026, 0, 1);
    const client = setClient([
      { ...makeMessage(10, baseMs + 1000, "target"), internalDate: new Date(baseMs + 1000).toISOString() },
    ]);

    await expect(resolveUidByMailId(config, makeMailId(baseMs + 800), "INBOX"))
      .resolves.toBe(10);
    expect(client.fetch).toHaveBeenCalledWith(
      "10", { uid: true, envelope: true, internalDate: true }, { uid: true },
    );
  });

  it("검색 UID가 역순이고 사이 번호가 비어도 올바른 UID를 찾는다", async () => {
    const baseMs = Date.UTC(2026, 0, 1);
    setClient([
      makeMessage(500, baseMs + 3000, "after"),
      makeMessage(40, baseMs, "target"),
      makeMessage(2, baseMs - 3000, "before"),
    ]);

    await expect(resolveUidByMailId(config, makeMailId(baseMs), "INBOX"))
      .resolves.toBe(40);
  });

  it.each([-1000, 2000])("후보 초 범위 밖인 %i ms의 메일을 선택하지 않는다", async (offset) => {
    const baseMs = Date.UTC(2026, 0, 1);
    const client = setClient([makeMessage(10, baseMs + offset, "outside")]);

    await expect(resolveUidByMailId(config, makeMailId(baseMs), "INBOX"))
      .rejects.toThrow("--search");
    expect(client.release).toHaveBeenCalled();
    expect(client.logout).toHaveBeenCalled();
  });

  it.each([false, []] as const)("검색 결과가 %j이면 조회를 중단하고 연결을 정리한다", async (result) => {
    const client = setClient([]);
    client.search.mockResolvedValue(result === false ? false : [...result]);

    await expect(resolveUidByMailId(config, makeMailId(Date.UTC(2026, 0, 1)), "INBOX"))
      .rejects.toThrow("--search");
    expect(client.fetchOne).not.toHaveBeenCalled();
    expect(client.fetch).not.toHaveBeenCalled();
    expect(client.release).toHaveBeenCalled();
    expect(client.logout).toHaveBeenCalled();
  });

  it.each([
    { seq: 10, uid: 10 },
    { seq: 10, uid: 10, internalDate: new Date(NaN) },
    { seq: 10, uid: 10, internalDate: "invalid-date" },
  ] satisfies FetchMessageObject[])("후보 응답 %j로 도착 시각을 알 수 없으면 중단한다", async (response) => {
    const baseMs = Date.UTC(2026, 0, 1);
    const client = setClient([makeMessage(10, baseMs, "target")]);
    client.fetch.mockImplementation(async function* () {
      yield response;
    });

    await expect(resolveUidByMailId(config, makeMailId(baseMs), "INBOX"))
      .rejects.toThrow("불완전");
    expect(client.release).toHaveBeenCalled();
    expect(client.logout).toHaveBeenCalled();
  });

  it.each(["응답 누락", "날짜 누락"])("후보의 %s을 무시하고 남은 UID를 고르지 않는다", async (failure) => {
    const baseMs = Date.UTC(2026, 0, 1);
    const messages = [makeMessage(10, baseMs, "first"), makeMessage(20, baseMs, "second")];
    const client = setClient(messages);
    client.fetch.mockImplementation(async function* () {
      yield messages[0];
      if (failure === "날짜 누락") yield { seq: 20, uid: 20 };
    });

    await expect(resolveUidByMailId(config, makeMailId(baseMs), "INBOX"))
      .rejects.toThrow("불완전");
    expect(client.release).toHaveBeenCalled();
    expect(client.logout).toHaveBeenCalled();
  });

  it("봉투 정보가 없는 메일도 모호한 후보에서 제외하지 않는다", async () => {
    const baseMs = Date.UTC(2026, 0, 1);
    setClient([
      makeMessage(10, baseMs, "first"),
      { seq: 20, uid: 20, internalDate: new Date(baseMs) },
    ]);

    const error = await catchError(resolveUidByMailId(config, makeMailId(baseMs), "INBOX"));
    expect(error.message).toContain("UID: 10");
    expect(error.message).toContain("UID: 20");
    expect(error.message).toContain("(제목 없음)");
  });

  it("이웃 창 밖에 있던 같은 초의 메일도 후보에 들어와 모호함으로 알린다", async () => {
    const baseMs = Date.UTC(2026, 0, 1);
    setClient([
      ...Array.from({ length: 8 }, (_, index) => makeMessage(index + 1, baseMs - 1000, "before")),
      makeMessage(9, baseMs, "first"),
      makeMessage(10, baseMs, "second"),
    ]);

    const error = await catchError(resolveUidByMailId(config, makeMailId(baseMs), "INBOX"));
    expect(error.message).toContain("여러 건");
    expect(error.message).toContain("UID: 9");
    expect(error.message).toContain("UID: 10");
  });

  it("후보 조회 중 서버 오류가 나도 잠금과 연결을 해제한다", async () => {
    const baseMs = Date.UTC(2026, 0, 1);
    const client = setClient([makeMessage(10, baseMs, "target")]);
    const failure = new Error("Connection closed");
    client.fetch.mockImplementation(async function* () {
      throw failure;
    });

    await expect(resolveUidByMailId(config, makeMailId(baseMs), "INBOX"))
      .rejects.toBe(failure);
    expect(client.release).toHaveBeenCalled();
    expect(client.logout).toHaveBeenCalled();
  });

  it("사서함 잠금 실패 시 연결을 종료하고 얻지 못한 잠금은 해제하지 않는다", async () => {
    const client = setClient([]);
    const failure = new Error("Mailbox does not exist");
    client.getMailboxLock.mockRejectedValue(failure);

    await expect(resolveUidByMailId(config, makeMailId(Date.UTC(2026, 0, 1)), "sent"))
      .rejects.toBe(failure);
    expect(client.release).not.toHaveBeenCalled();
    expect(client.logout).toHaveBeenCalled();
  });

  it("연결 실패 시 원인을 보존하고 연결을 닫는다", async () => {
    const client = setClient([]);
    client.usable = false;
    client.connect.mockRejectedValue(new Error("connection refused"));

    await expect(resolveUidByMailId(config, makeMailId(Date.UTC(2026, 0, 1)), "INBOX"))
      .rejects.toThrow("connection refused");
    expect(client.release).not.toHaveBeenCalled();
    expect(client.close).toHaveBeenCalled();
  });
});

describe("getMail", () => {
  it.each([new Date("2026-01-02T03:04:05Z"), "2026-01-02T03:04:05Z"])(
    "IMAP 도착 시각 %s를 요청하고 헤더 날짜와 구분해 반환한다",
    async (internalDate) => {
      const envelopeDate = new Date("2026-01-01T00:00:00Z");
      const message = makeMessage(1, envelopeDate.getTime(), "hello");
      const client = setClient([{
        ...message,
        envelope: { ...message.envelope, date: envelopeDate },
        internalDate,
      }]);

      await expect(getMail(config, 1)).resolves.toMatchObject({
        uid: 1,
        date: envelopeDate,
        internalDate: new Date("2026-01-02T03:04:05Z"),
      });
      expect(client.fetchOne).toHaveBeenCalledWith(
        "1",
        { uid: true, flags: true, envelope: true, source: true, internalDate: true },
        { uid: true },
      );
    },
  );

  it.each([undefined, "invalid-date", new Date(NaN)])(
    "IMAP 도착 시각이 %s이어도 기존 UID 조회는 유지한다",
    async (internalDate) => {
      const message = makeMessage(1, Date.UTC(2026, 0, 1), "hello");
      setClient([{ ...message, internalDate }]);

      await expect(getMail(config, 1)).resolves.toMatchObject({
        uid: 1,
        internalDate: null,
        body: "Body 1",
      });
    },
  );

  it("사서함 인자를 getMailboxLock 에 전달한다", async () => {
    const baseMs = Date.UTC(2026, 0, 1, 0, 0, 0);
    const messages = [makeMessage(1, baseMs, "hello")];
    const client = setClient(messages);

    await expect(getMail(config, 1, "sent")).resolves.toMatchObject({ uid: 1 });
    expect(client.getMailboxLock).toHaveBeenCalledWith("sent");
  });

  it("사서함을 생략하면 기존 INBOX 조회를 유지한다", async () => {
    const client = setClient([makeMessage(1, Date.UTC(2026, 0, 1), "hello")]);

    await expect(getMail(config, 1)).resolves.toMatchObject({ uid: 1 });
    expect(client.getMailboxLock).toHaveBeenCalledWith("INBOX");
    expect(client.release).toHaveBeenCalled();
    expect(client.logout).toHaveBeenCalled();
  });
});

function makeAttachmentMessage(
  uid: number,
  parts: Array<{ filename?: string; type: string; content: string; inline?: boolean }>,
): FetchMessageObject {
  const lines = [
    "Subject: with files",
    "From: Sender <sender@example.com>",
    "To: Receiver <receiver@example.com>",
    "MIME-Version: 1.0",
    'Content-Type: multipart/mixed; boundary="b1"',
    "",
    "--b1",
    "Content-Type: text/plain; charset=utf-8",
    "",
    "본문",
  ];
  for (const part of parts) {
    const name = part.filename ? `; name="${part.filename}"` : "";
    const disp = part.inline ? "inline" : "attachment";
    const dispName = part.filename ? `; filename="${part.filename}"` : "";
    lines.push(
      "--b1",
      `Content-Type: ${part.type}${name}`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: ${disp}${dispName}`,
      "",
      Buffer.from(part.content).toString("base64"),
    );
  }
  lines.push("--b1--", "");
  return {
    seq: uid,
    uid,
    envelope: { subject: "with files" },
    flags: new Set(),
    source: Buffer.from(lines.join("\r\n")),
  };
}

describe("메일 첨부", () => {
  it("getMail 이 첨부 메타데이터를 순번과 함께 돌려준다", async () => {
    setClient([makeAttachmentMessage(1, [
      { filename: "a.crt", type: "application/x-x509-ca-cert", content: "hello" },
      { filename: "logo.png", type: "image/png", content: "pngdata!!", inline: true },
    ])]);

    const mail = await getMail(config, 1);

    expect(mail.attachments).toEqual([
      { index: 1, fileName: "a.crt", size: 5, contentType: "application/x-x509-ca-cert", inline: false },
      { index: 2, fileName: "logo.png", size: 9, contentType: "image/png", inline: true },
    ]);
    expect(mail.attachments[0]).not.toHaveProperty("content");
  });

  it("첨부가 없으면 빈 배열이다", async () => {
    setClient([makeMessage(1, Date.UTC(2026, 0, 1), "hello")]);

    expect((await getMail(config, 1)).attachments).toEqual([]);
  });

  it("getMailAttachments 가 내용 Buffer 와 제목을 돌려준다", async () => {
    const client = setClient([makeAttachmentMessage(1, [
      { filename: "a.crt", type: "application/octet-stream", content: "hello" },
    ])]);

    const result = await getMailAttachments(config, 1);

    expect(result.subject).toBe("with files");
    expect(result.attachments).toHaveLength(1);
    expect(result.attachments[0].index).toBe(1);
    expect(result.attachments[0].content.toString()).toBe("hello");
    expect(client.release).toHaveBeenCalled();
    expect(client.logout).toHaveBeenCalled();
  });

  it("getMailAttachments 는 없는 UID 에서 DoorayCliError 를 던진다", async () => {
    setClient([makeAttachmentMessage(1, [])]);

    const error = await catchError(getMailAttachments(config, 99));

    expect(error).toBeInstanceOf(DoorayCliError);
    expect(error.message).toBe("메일을 찾을 수 없습니다: UID 99");
    expect(error.exitCode).toBe(1);
  });

  it("같은 이름의 첨부는 두 번째부터 순번을 붙여 구분한다", async () => {
    setClient([makeAttachmentMessage(1, [
      { filename: "a.crt", type: "application/octet-stream", content: "one" },
      { filename: "a.crt", type: "application/octet-stream", content: "two" },
    ])]);

    const mail = await getMail(config, 1);

    expect(mail.attachments.map((a) => a.fileName)).toEqual(["a.crt", "a-2.crt"]);
  });
});

describe("saveToSent", () => {
  type Box = { path: string; specialUse?: string; specialUseSource?: string };
  const raw = Buffer.from("RAW-MESSAGE");

  function setup(boxes: Box[], append: unknown = { uid: 1 }) {
    const fake = createFakeClient([]) as FakeClient & {
      list: ReturnType<typeof vi.fn>;
      append: ReturnType<typeof vi.fn>;
    };
    fake.list = vi.fn().mockResolvedValue(boxes);
    fake.append = vi.fn().mockResolvedValue(append);
    mockState.client = fake;
    return fake;
  }

  it("\\Sent 특수 용도 메일함에 원문 그대로 \\Seen 과 함께 넣는다", async () => {
    const fake = setup([
      { path: "INBOX", specialUse: "\\Inbox", specialUseSource: "extension" },
      { path: "Sent Items", specialUse: "\\Sent", specialUseSource: "extension" },
    ]);

    await expect(saveToSent(config, raw)).resolves.toEqual({ saved: true });

    const [path, content, flags] = fake.append.mock.calls[0];
    expect(path).toBe("Sent Items");
    expect((content as Buffer).equals(raw)).toBe(true);
    expect(flags).toEqual(["\\Seen"]);
    expect(fake.logout).toHaveBeenCalled();
  });

  it("이름이 Sent 여도 특수 용도가 없으면 넣지 않고 사유를 돌려준다", async () => {
    const fake = setup([{ path: "Sent" }, { path: "INBOX", specialUse: "\\Inbox" }]);

    const result = await saveToSent(config, raw);

    expect(result.saved).toBe(false);
    expect(result.reason).toContain("\\Sent");
    expect(fake.append).not.toHaveBeenCalled();
  });

  it("이름으로 추정한 특수 용도(name)는 인정하지 않는다", async () => {
    const fake = setup([{ path: "Sent", specialUse: "\\Sent", specialUseSource: "name" }]);

    expect((await saveToSent(config, raw)).saved).toBe(false);
    expect(fake.append).not.toHaveBeenCalled();
  });

  it("APPEND 가 실패해도 던지지 않고 사유를 돌려준다", async () => {
    setup([{ path: "Sent", specialUse: "\\Sent", specialUseSource: "extension" }]);
    (mockState.client as unknown as { append: unknown }).append = vi
      .fn()
      .mockRejectedValue(new Error("quota exceeded"));

    await expect(saveToSent(config, raw)).resolves.toEqual({
      saved: false,
      reason: "quota exceeded",
    });
  });

  it("연결이 실패해도 던지지 않는다", async () => {
    const fake = setup([]);
    fake.connect.mockRejectedValue(new Error("refused"));

    const result = await saveToSent(config, raw);

    expect(result.saved).toBe(false);
  });
});
