import { describe, expect, it } from "vitest";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
import {
  buildEventRequest,
  buildRecurrenceRule,
  EVENT_BODY_DEFAULT_MIME,
  instanceOriginalId,
  isEmptyEventRequest,
  mergeExistingUsers,
  needsExistingUsers,
  parseAlarm,
  toWriteUsers,
} from "./event-request.js";

const paramError = expect.objectContaining({ exitCode: EXIT_PARAM_ERROR });

describe("parseAlarm", () => {
  it.each([
    ["10m", { action: "app", trigger: "TRIGGER:-PT10M" }],
    ["2h", { action: "app", trigger: "TRIGGER:-PT2H" }],
    ["mail:1d", { action: "mail", trigger: "TRIGGER:-P1D" }],
    ["app:1w", { action: "app", trigger: "TRIGGER:-P1W" }],
    ["0m", { action: "app", trigger: "TRIGGER:-PT0M" }],
  ])("%s", (spec, expected) => {
    expect(parseAlarm(spec)).toEqual(expected);
  });

  it.each(["10s", "10", "m", "sms:10m", "-10m", "1.5h", "10 m"])(
    "잘못된 표기 %s 는 거부한다",
    (spec) => {
      expect(() => parseAlarm(spec)).toThrow(paramError);
    },
  );
});

describe("buildRecurrenceRule", () => {
  const tz = "Asia/Seoul";

  it("--repeat 이 없으면 규칙을 만들지 않는다", () => {
    expect(buildRecurrenceRule({}, tz)).toBeUndefined();
  });

  it("빈도만 주면 interval 1 과 시간대를 채운다", () => {
    expect(buildRecurrenceRule({ repeat: "weekly" }, tz)).toEqual({
      frequency: "weekly",
      interval: 1,
      timezoneName: tz,
    });
  });

  it("부속 옵션을 담는다. byday 는 그대로 넘긴다", () => {
    expect(
      buildRecurrenceRule(
        {
          repeat: "monthly",
          repeatInterval: "2",
          repeatUntil: "2026-12-31T09:00:00+09:00",
          repeatByday: "-1 WE",
          repeatBymonth: "3",
          repeatBymonthday: "15",
        },
        tz,
      ),
    ).toEqual({
      frequency: "monthly",
      interval: 2,
      until: "2026-12-31T09:00:00+09:00",
      byday: "-1 WE",
      bymonth: "3",
      bymonthday: "15",
      timezoneName: tz,
    });
  });

  it.each([
    ["repeatInterval", "2"],
    ["repeatUntil", "2026-12-31"],
    ["repeatByday", "TH"],
    ["repeatBymonth", "3"],
    ["repeatBymonthday", "15"],
  ])("--repeat 없이 %s 만 주면 거부한다", (key, value) => {
    expect(() => buildRecurrenceRule({ [key]: value }, tz)).toThrow(/--repeat 과 함께/);
  });

  it("bymonthday·bymonth 는 쉼표 목록을 공백 없이 잇는다", () => {
    expect(
      buildRecurrenceRule(
        {
          repeat: "monthly",
          repeatByday: "TH",
          repeatBymonthday: "18, 19,20,21,22,23,24",
          repeatBymonth: "1,7",
        },
        tz,
      ),
    ).toMatchObject({ byday: "TH", bymonthday: "18,19,20,21,22,23,24", bymonth: "1,7" });
  });

  it.each([
    ["repeatBymonthday", "18,,20"],
    ["repeatBymonthday", "18,"],
    ["repeatBymonthday", "18,32"],
    ["repeatBymonth", "0,1"],
    ["repeatBymonth", "1,x"],
  ])("목록 %s=%s 에 빈 항목이나 범위 밖 값이 있으면 거부한다", (key, value) => {
    expect(() => buildRecurrenceRule({ repeat: "monthly", [key]: value }, tz)).toThrow(paramError);
  });

  it("모르는 빈도는 거부한다", () => {
    expect(() => buildRecurrenceRule({ repeat: "hourly" }, tz)).toThrow(paramError);
  });

  it.each([
    ["repeatInterval", "0"],
    ["repeatInterval", "abc"],
    ["repeatBymonth", "13"],
    ["repeatBymonthday", "32"],
    ["repeatBymonthday", "-1"],
  ])("범위 밖 %s=%s 는 거부한다", (key, value) => {
    expect(() => buildRecurrenceRule({ repeat: "yearly", [key]: value }, tz)).toThrow(paramError);
  });
});

describe("buildEventRequest", () => {
  it("준 값만 담는다", () => {
    expect(buildEventRequest({ subject: "회의" })).toEqual({ subject: "회의" });
  });

  it("본문은 기본 mimeType 으로 싣고 빈 본문은 키를 만들지 않는다", () => {
    expect(buildEventRequest({ bodyContent: "안건" }).body).toEqual({
      mimeType: EVENT_BODY_DEFAULT_MIME,
      content: "안건",
    });
    expect(buildEventRequest({ bodyContent: "안건", mimeType: "text/x-markdown" }).body?.mimeType).toBe(
      "text/x-markdown",
    );
    expect(buildEventRequest({ bodyContent: "" })).not.toHaveProperty("body");
  });

  it("참석자와 참조자를 member 형태로 싣는다", () => {
    expect(buildEventRequest({ to: ["1111222233334444555"], cc: ["2222333344445555666"] }).users).toEqual({
      to: [{ type: "member", member: { organizationMemberId: "1111222233334444555" } }],
      cc: [{ type: "member", member: { organizationMemberId: "2222333344445555666" } }],
    });
    expect(buildEventRequest({ cc: ["2222333344445555666"] }).users).not.toHaveProperty("to");
  });

  it("시각은 세 필드를 함께 싣는다", () => {
    expect(
      buildEventRequest({
        schedule: { startedAt: "2026-09-18+09:00", endedAt: "2026-09-19+09:00", wholeDayFlag: true },
      }),
    ).toEqual({ startedAt: "2026-09-18+09:00", endedAt: "2026-09-19+09:00", wholeDayFlag: true });
  });

  it("personalSettings 는 알림·비공개 중 준 것만 담고 없으면 만들지 않는다", () => {
    expect(buildEventRequest({ alarms: [], isPrivate: false })).toEqual({});
    expect(buildEventRequest({ isPrivate: true }).personalSettings).toEqual({ class: "private" });
    expect(
      buildEventRequest({ alarms: [{ action: "app", trigger: "TRIGGER:-PT10M" }] }).personalSettings,
    ).toEqual({ alarms: [{ action: "app", trigger: "TRIGGER:-PT10M" }] });
  });

  it("아무것도 없으면 빈 요청이다", () => {
    expect(isEmptyEventRequest(buildEventRequest({ bodyContent: "" }))).toBe(true);
    expect(isEmptyEventRequest(buildEventRequest({ location: "회의실 A" }))).toBe(false);
  });
});

describe("buildEventRequest — 생성", () => {
  it("참석자와 본문이 없어도 users 와 body 키를 싣는다", () => {
    expect(buildEventRequest({ subject: "휴가" }, "create")).toEqual({
      subject: "휴가",
      users: {},
      body: { mimeType: EVENT_BODY_DEFAULT_MIME, content: "" },
    });
  });

  it("준 참석자와 본문은 그대로 싣는다", () => {
    const req = buildEventRequest({ bodyContent: "안건", cc: ["2222333344445555666"] }, "create");
    expect(req.body).toEqual({ mimeType: EVENT_BODY_DEFAULT_MIME, content: "안건" });
    expect(req.users).toEqual({
      cc: [{ type: "member", member: { organizationMemberId: "2222333344445555666" } }],
    });
  });
});

describe("기존 참석자 병합", () => {
  const existing = {
    to: [
      { type: "member", status: "accepted", member: { organizationMemberId: "1111222233334444555", name: "홍길동" } },
      { type: "emailUser", emailUser: { emailAddress: "user@example.com", name: "김철수" } },
    ],
    cc: [{ type: "member", member: { organizationMemberId: "3333444455556666777" } }],
  };
  const newMember = { type: "member" as const, member: { organizationMemberId: "2222333344445555666" } };

  it("cc 만 주면 to 를 기존 값으로 채우고 emailUser 를 보존한다", () => {
    const req = { users: { cc: [newMember] } };
    expect(needsExistingUsers(req)).toBe(true);
    expect(mergeExistingUsers(req, existing).users).toEqual({
      to: [
        { type: "member", member: { organizationMemberId: "1111222233334444555" } },
        { type: "emailUser", emailUser: { emailAddress: "user@example.com", name: "김철수" } },
      ],
      cc: [newMember],
    });
  });

  it("to 만 주면 cc 를 기존 값으로 채운다", () => {
    expect(mergeExistingUsers({ users: { to: [newMember] } }, existing).users).toEqual({
      to: [newMember],
      cc: [{ type: "member", member: { organizationMemberId: "3333444455556666777" } }],
    });
  });

  it("기존 값이 없으면 빈 목록으로 채운다", () => {
    expect(mergeExistingUsers({ users: { to: [newMember] } }, { to: null }).users).toEqual({
      to: [newMember],
      cc: [],
    });
  });

  it("둘 다 줬거나 둘 다 없으면 조회가 필요 없고 손대지 않는다", () => {
    const both = { users: { to: [newMember], cc: [] } };
    expect(needsExistingUsers(both)).toBe(false);
    expect(mergeExistingUsers(both, existing)).toBe(both);
    expect(needsExistingUsers({ subject: "x" })).toBe(false);
  });

  it("옮길 수 없는 항목이 있으면 조용히 빼지 않고 멈춘다", () => {
    expect(() => toWriteUsers([{ type: "group" }], "to")).toThrow(paramError);
    expect(() => toWriteUsers([{ type: "member", member: {} }], "cc")).toThrow(/참조자/);
  });
});

describe("instanceOriginalId", () => {
  it("회차 id 에서 원본 id 를 잘라낸다", () => {
    expect(instanceOriginalId("1234567890123456789-20261109T000000Z")).toBe("1234567890123456789");
  });

  it("원본 id 와 형식이 다른 꼬리는 회차가 아니다", () => {
    expect(instanceOriginalId("1234567890123456789")).toBeNull();
    expect(instanceOriginalId("1234567890123456789-20261109T0000Z")).toBeNull();
    expect(instanceOriginalId("-20261109T000000Z")).toBeNull();
  });
});
