import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assertWebSupported, WEB_SUPPORTED_COMMANDS } from "./web-support.js";

describe("웹 명령 지원 범위", () => {
  it.each(Object.keys(WEB_SUPPORTED_COMMANDS))("구현한 %s 는 통과한다", (path) => {
    expect(() => assertWebSupported(path, {}, "web")).not.toThrow();
  });
  it.each(["post list", "wiki page get", "messenger send", "calendar event list", "stream list"])("아직 옮기지 않은 %s 를 막는다", (path) => {
    expect(() => assertWebSupported(path, {}, "web")).toThrow(expect.objectContaining({ exitCode: 3 }));
    expect(() => assertWebSupported(path, {}, "api-key")).not.toThrow();
  });
  it("아직 옮기지 않은 소속 보강 옵션을 막는다", () => {
    expect(() => assertWebSupported("member get", { withOrg: true }, "web")).toThrow(expect.objectContaining({ exitCode: 3 }));
    expect(() => assertWebSupported("member get", { withOrg: false }, "web")).not.toThrow();
  });
  it.each(["setup", "config set", "doctor", "cache clear", "skill update", "feedback", "mail list"])("설정·메일 명령 %s 는 통과한다", (path) => {
    expect(() => assertWebSupported(path, {}, "web")).not.toThrow();
  });
  it("사용자 가이드의 명령·옵션 표와 코드 목록이 같다", () => {
    const guide = readFileSync(new URL("../../docs/guide/setup.md", import.meta.url), "utf8");
    const section = guide.split("## 웹 방식의 지원 범위")[1].split("### 뒤에 지원할 영역")[0];
    const entries = [...section.matchAll(/^\| `([^`]+)` \| (.+) \|$/gm)];
    expect(entries.map((match) => match[1]).sort()).toEqual(Object.keys(WEB_SUPPORTED_COMMANDS).sort());
    for (const [, path, text] of entries) {
      const options = [...text.matchAll(/`--([^`]+)`/g)].map((match) => match[1].replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase()));
      expect(options).toEqual(WEB_SUPPORTED_COMMANDS[path]);
    }
  });
});
