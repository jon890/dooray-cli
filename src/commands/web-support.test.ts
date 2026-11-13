import { Command } from "commander";
import { DoorayCliError } from "../utils/errors.js";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { assertWebSupported, guardWebCommand, WEB_SUPPORTED_COMMANDS, WEB_SUPPORT_BY_DOMAIN } from "./web-support.js";

describe("웹 명령 지원 범위", () => {
  it.each(Object.keys(WEB_SUPPORTED_COMMANDS))("구현한 %s 는 통과한다", (path) => {
    expect(() => assertWebSupported(path, {}, "web")).not.toThrow();
  });
  it("목록에서 계산한 미등록 경로는 막고 API 방식은 통과시킨다", () => {
    const path = Object.keys(WEB_SUPPORTED_COMMANDS).map((name) => `${name} __unregistered__`).find((name) => !Object.hasOwn(WEB_SUPPORTED_COMMANDS, name)) ?? "__unregistered__";
    expect(() => assertWebSupported(path, {}, "web")).toThrow(expect.objectContaining({ exitCode: 3 }));
    expect(() => assertWebSupported(path, {}, "api-key")).not.toThrow();
  });
  it("각 목록의 미지원 옵션을 막고 거짓 값은 통과시킨다", () => {
    for (const [path, options] of Object.entries(WEB_SUPPORTED_COMMANDS)) for (const option of options) {
      expect(() => assertWebSupported(path, { [option]: true }, "web")).toThrow(expect.objectContaining({ exitCode: 3 }));
      expect(() => assertWebSupported(path, { [option]: false }, "web")).not.toThrow();
    }
  });
  it.each(["setup", "config set", "doctor", "cache clear", "skill update", "feedback", "mail list"])("설정·메일 명령 %s 는 통과한다", (path) => {
    expect(() => assertWebSupported(path, {}, "web")).not.toThrow();
  });
  it("사용자 가이드의 명령·옵션 표와 코드 목록이 같다", () => {
    const guide = readFileSync(new URL("../../docs/guide/setup.md", import.meta.url), "utf8");
    const support = guide.split("## 웹 방식의 지원 범위")[1].split("## 보안 경고와 진단")[0];
    const labels = { project: "프로젝트", member: "멤버", post: "업무", wiki: "위키", messenger: "메신저", calendar: "캘린더", stream: "스트림" };
    for (const [domain, list] of Object.entries(WEB_SUPPORT_BY_DOMAIN)) {
      const section = support.split(`### ${labels[domain as keyof typeof labels]}\n`)[1]?.split(/\n### /)[0];
      expect(section).toBeDefined();
      const table = section!.split("#### 웹 응답에서")[0];
      const entries = [...table.matchAll(/^\| `([^`]+)` \| (.+) \|$/gm)];
      expect(entries.map((match) => match[1]).sort()).toEqual(Object.keys(list).sort());
      for (const [, path, text] of entries) {
        const options = [...text.matchAll(/`--([^`]+)`/g)].map((match) => match[1].replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase()));
        expect(options).toEqual((list as Readonly<Record<string, readonly string[]>>)[path]);
      }
    }
  });
});

describe("preAction 의 명령 연결", () => {
  it("중첩 명령 경로를 모으고 옵션을 판정에 전달한다", async () => {
    const root = new Command("dooray");
    const list = root.command("project").command("tags").command("list");
    const read = vi.fn(async () => "web" as const);
    await expect(guardWebCommand(list, read)).resolves.toBeUndefined();
    expect(read).toHaveBeenCalledTimes(1);
    const get = root.command("member").command("get").option("--with-org"); get.setOptionValue("withOrg", true);
    if (WEB_SUPPORTED_COMMANDS["member get"].includes("withOrg")) await expect(guardWebCommand(get, read)).rejects.toMatchObject({ exitCode: 3 });
  });
  it("면제 명령은 설정 파일을 읽지 않는다", async () => {
    const root = new Command("dooray"), read = vi.fn(async () => "web" as const);
    await guardWebCommand(root.command("config").command("set"), read);
    await guardWebCommand(root.command("mail").command("list"), read);
    expect(read).not.toHaveBeenCalled();
  });
  it("손상·읽기 실패 설정은 명령의 기존 삭제 확인 순서를 유지한다", async () => {
    const action = new Command("dooray").command("__unregistered__");
    await expect(guardWebCommand(action, async () => { throw new DoorayCliError("설정 읽기 실패", 4); })).resolves.toBeUndefined();
    await expect(guardWebCommand(action, async () => { throw new Error("unexpected"); })).rejects.toThrow("unexpected");
  });
});
