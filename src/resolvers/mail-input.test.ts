import { describe, expect, it } from "vitest";
import { DoorayCliError } from "../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../utils/exit-codes.js";
import {
  classifyMailInputToken,
  resolveMailTarget,
} from "./mail-input.js";

describe("classifyMailInputToken", () => {
  it("URL 은 url 로 분류한다", () => {
    expect(classifyMailInputToken("https://x.dooray.com/mail/1234567890123456789")).toBe("url");
  });

  it("1~4294967295 는 uid 로 분류한다", () => {
    expect(classifyMailInputToken("1")).toBe("uid");
    expect(classifyMailInputToken("4294967295")).toBe("uid");
  });

  it("4294967296 이상 숫자는 mailId 로 분류한다", () => {
    expect(classifyMailInputToken("4294967296")).toBe("mailId");
    expect(classifyMailInputToken("1234567890123456789")).toBe("mailId");
  });

  it("나머지는 invalid 로 분류한다", () => {
    expect(classifyMailInputToken("")).toBe("invalid");
    expect(classifyMailInputToken("0")).toBe("invalid");
    expect(classifyMailInputToken("abc")).toBe("invalid");
    expect(classifyMailInputToken(" 1 ")).toBe("invalid");
  });
});

describe("resolveMailTarget", () => {
  it("uid 는 INBOX 를 붙여 그대로 반환한다", () => {
    expect(resolveMailTarget("337")).toEqual({
      kind: "uid",
      uid: 337,
      mailbox: "INBOX",
    });
  });

  it("mailId 는 INBOX 를 붙여 그대로 반환한다", () => {
    expect(resolveMailTarget("1234567890123456789")).toEqual({
      kind: "mailId",
      mailId: "1234567890123456789",
      mailbox: "INBOX",
    });
  });

  it("sent 주소는 sent 사서함으로 옮긴다", () => {
    expect(
      resolveMailTarget("https://x.dooray.com/mail/systems/sent/1234567890123456789"),
    ).toEqual({
      kind: "mailId",
      mailId: "1234567890123456789",
      mailbox: "sent",
    });
  });

  it.each(["Sent", "INBOX", "TRASH", "Archive"])(
    "폴더 %s 처럼 대문자가 섞여도 같은 사서함으로 옮긴다",
    (folder) => {
      const target = resolveMailTarget(
        `https://x.dooray.com/mail/systems/${folder}/1234567890123456789`,
      );
      expect(target).toEqual({
        kind: "mailId",
        mailId: "1234567890123456789",
        mailbox: folder.toLowerCase() === "inbox" ? "INBOX" : folder.toLowerCase(),
      });
    },
  );

  it.each(["unknown", "promotions", "constructor"])(
    "지원하지 않는 폴더 %s 는 INBOX 로 대체하지 않고 거절한다",
    (folder) => {
      // INBOX 로 대체하면 사용자는 자기 폴더가 무시된 것을 모른 채
      // INBOX 에 없다는 오류만 받는다.
      try {
        resolveMailTarget(
          `https://x.dooray.com/mail/systems/${folder}/1234567890123456789`,
        );
        expect.unreachable("거절해야 한다");
      } catch (error) {
        expect(error).toBeInstanceOf(DoorayCliError);
        const err = error as DoorayCliError;
        expect(err.exitCode).toBe(EXIT_PARAM_ERROR);
        expect(err.message).toContain(folder);
        expect(err.message).toContain("지원 폴더");
      }
    },
  );

  it("systems 가 없는 mail URL 은 마지막 숫자 구간만 쓴다", () => {
    expect(
      resolveMailTarget("https://x.dooray.com/mail/1234567890123456789"),
    ).toEqual({
      kind: "mailId",
      mailId: "1234567890123456789",
      mailbox: "INBOX",
    });
  });

  it("비숫자 입력은 형식 오류로 거절한다", () => {
    expect(() => resolveMailTarget("abc")).toThrow(DoorayCliError);
    expect(() => resolveMailTarget("abc")).toThrow(/메일 입력 형식이 올바르지 않습니다/);
  });

  it("0 은 형식 오류로 거절한다", () => {
    try {
      resolveMailTarget("0");
      throw new Error("예상한 오류가 발생하지 않았다");
    } catch (error) {
      expect(error).toBeInstanceOf(DoorayCliError);
      expect(error).toMatchObject({ exitCode: EXIT_PARAM_ERROR });
    }
  });

  it("메일 URL 이 아니면 원본 URL 을 담아 파라미터 오류를 던진다", () => {
    const input = "https://x.dooray.com/task/to/1234567890123456789";

    try {
      resolveMailTarget(input);
      throw new Error("예상한 오류가 발생하지 않았다");
    } catch (error) {
      expect(error).toBeInstanceOf(DoorayCliError);
      expect(error).toMatchObject({ exitCode: EXIT_PARAM_ERROR });
      expect(String((error as Error).message)).toContain(input);
    }
  });
});
