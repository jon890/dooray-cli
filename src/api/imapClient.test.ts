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

import { getMail, resolveUidByMailId } from "./imapClient.js";

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
    search: vi.fn<() => Promise<number[] | false>>()
      .mockResolvedValue(messages.map((msg) => msg.uid)),
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
    expect(client.search).toHaveBeenCalledWith({ all: true }, { uid: true });
    expect(client.fetchOne.mock.calls.length).toBeGreaterThan(0);
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
  });

  it("4000통 입력에서 fetchOne 조회는 로그 수준에 머문다", async () => {
    const baseMs = Date.UTC(2026, 0, 1, 0, 0, 0);
    const messages = Array.from({ length: 4000 }, (_, index) =>
      makeMessage(index + 1, baseMs + index * 3000, `subject-${index + 1}`),
    );
    const client = setClient(messages);
    const target = messages[2345];
    const mailId = makeMailId(target.internalDate.getTime());

    await expect(resolveUidByMailId(config, mailId, "INBOX")).resolves.toBe(2346);
    expect(client.fetchOne.mock.calls.length).toBeLessThanOrEqual(20);
    expect(client.search).toHaveBeenCalledOnce();
    expect(client.fetch).toHaveBeenCalledOnce();
    expect(client.fetch.mock.calls[0][0].split(",").length).toBeLessThanOrEqual(17);
  });

  it("초 경계를 넘은 도착 시각과 문자열 날짜를 처리한다", async () => {
    const baseMs = Date.UTC(2026, 0, 1);
    const client = setClient([
      { ...makeMessage(10, baseMs + 1000, "target"), internalDate: new Date(baseMs + 1000).toISOString() },
    ]);

    await expect(resolveUidByMailId(config, makeMailId(baseMs + 800), "INBOX"))
      .resolves.toBe(10);
    expect(client.fetchOne).toHaveBeenCalledWith(
      "10", { uid: true, internalDate: true }, { uid: true },
    );
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
    false,
    { seq: 10, uid: 10 },
    { seq: 10, uid: 10, internalDate: new Date(NaN) },
    { seq: 10, uid: 10, internalDate: "invalid-date" },
  ] satisfies Array<FetchMessageObject | false>)("탐색 응답 %j로 도착 시각을 알 수 없으면 중단한다", async (response) => {
    const baseMs = Date.UTC(2026, 0, 1);
    const client = setClient([makeMessage(10, baseMs, "target")]);
    client.fetchOne.mockResolvedValue(response);

    await expect(resolveUidByMailId(config, makeMailId(baseMs), "INBOX"))
      .rejects.toThrow("불완전");
    expect(client.fetch).not.toHaveBeenCalled();
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

  it("조회 범위 끝의 단일 후보 뒤에 같은 초의 메일이 더 있으면 선택하지 않는다", async () => {
    const baseMs = Date.UTC(2026, 0, 1);
    setClient([
      ...Array.from({ length: 8 }, (_, index) => makeMessage(index + 1, baseMs - 1000, "before")),
      makeMessage(9, baseMs, "first"),
      makeMessage(10, baseMs, "second"),
    ]);

    await expect(resolveUidByMailId(config, makeMailId(baseMs), "INBOX"))
      .rejects.toThrow("조회 범위 밖");
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
