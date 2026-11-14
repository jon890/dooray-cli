import { describe, expect, it } from "vitest";

import { collectHelp, firstDifference, parseSubcommands, renderSnapshot } from "./help-snapshot.mjs";

const ROOT_HELP = `Usage: dooray [options] [command]

Options:
  -V, --version   output the version number
  -h, --help      display help for command

Commands:
  post            업무 관련 명령
  doctor [options]
                  설정 및 환경 진단
  help [command]  display help for command
`;

describe("parseSubcommands", () => {
  it("Commands 절의 이름만 뽑고 help 와 넘어간 설명 줄은 뺀다", () => {
    expect(parseSubcommands(ROOT_HELP)).toEqual(["post", "doctor"]);
  });

  it("Commands 절이 없으면 빈 목록이다", () => {
    expect(parseSubcommands("Usage: dooray post get [options]\n\nOptions:\n  --json  JSON\n")).toEqual([]);
  });
});

describe("collectHelp", () => {
  it("하위 명령을 깊이 우선으로 모두 돈다", () => {
    const helps = {
      "": "Commands:\n  post  업무\n  wiki  위키\n",
      post: "Commands:\n  get  조회\n",
      "post get": "Usage: get\n",
      wiki: "Usage: wiki\n",
    };
    const entries = collectHelp((path) => helps[path.join(" ")]);
    expect(entries.map(([path]) => path.join(" "))).toEqual(["", "post", "post get", "wiki"]);
    expect(renderSnapshot(entries)).toContain("===== dooray post get\nUsage: get\n");
  });
});

describe("firstDifference", () => {
  it("같으면 0, 다르면 처음 어긋난 줄 번호다", () => {
    expect(firstDifference("a\nb\n", "a\nb\n")).toBe(0);
    expect(firstDifference("a\nb\n", "a\nc\n")).toBe(2);
    expect(firstDifference("a\n", "a\nb\n")).toBe(2);
  });
});
