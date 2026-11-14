import { describe, expect, it } from "vitest";
import { extractTargets } from "./doc-sync-extract.mjs";

const diff = (...lines) => ["@@ -0,0 +1 @@", ...lines.map((line) => `+${line}`)].join("\n");

describe("extractTargets", () => {
  it("한 줄짜리 선언을 그대로 잡는다", () => {
    const text = diff(
      'const cmd = new Command("move");',
      'cmd.option("--json", "JSON 출력");',
      'cmd.option("-y, --yes", "확인 생략");',
    );
    expect(extractTargets(text)).toEqual(["move", "--json", "--yes"]);
  });

  it("여러 줄에 걸친 .option( 과 .requiredOption( 을 잡는다", () => {
    const text = diff(
      "cmd",
      "  .option(",
      '    "-o, --output-file <path>",',
      '    "저장 경로",',
      "  )",
      "  .requiredOption(",
      '    "--parent <id>",',
      '    "부모",',
      "  );",
    );
    expect(extractTargets(text)).toEqual(["--output-file", "--parent"]);
  });

  it("new Option( 과 여러 줄 new Command( 와 .command( 를 잡는다", () => {
    const text = diff(
      "program.addOption(",
      '  new Option("--scope <scope>", "범위").choices(["a"]),',
      ");",
      "const sub = new Command(",
      '  "event-delete",',
      ");",
      'parent.command("archive <id>");',
    );
    expect(extractTargets(text)).toEqual(["event-delete", "archive", "--scope"]);
  });

  it("지워진 줄과 파일 머리말은 보지 않는다", () => {
    const text = [
      "diff --git a/src/a.ts b/src/a.ts",
      "+++ b/src/a.ts",
      "@@ -1 +1 @@",
      '-cmd.option("--old", "지움");',
      '+cmd.option("--new", "추가");',
    ].join("\n");
    expect(extractTargets(text)).toEqual(["--new"]);
  });

  it("떨어진 hunk 의 줄을 이어 붙여 가짜 선언을 만들지 않는다", () => {
    const text = [
      "@@ -1 +1 @@",
      "+  .option(",
      "@@ -9 +9 @@",
      '+  "--ghost",',
    ].join("\n");
    expect(extractTargets(text)).toEqual([]);
  });
});
