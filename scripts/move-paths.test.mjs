import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { expandMoves, runMoves } from "./move-paths.mjs";

const roots = [];
const script = fileURLToPath(new URL("./move-paths.mjs", import.meta.url));
const read = (root, file) => readFileSync(join(root, file), "utf8");
function write(root, file, content) {
  mkdirSync(dirname(join(root, file)), { recursive: true });
  writeFileSync(join(root, file), content);
}
function git(root, ...args) {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" });
}
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "dooray-move-paths-"));
  roots.push(root);
  git(root, "init", "--quiet");
  git(root, "config", "user.name", "Test User");
  git(root, "config", "user.email", "test@example.com");
  write(root, "src/utils/old.ts", 'import { helper } from "./helper.js";\nexport const value = helper;\n');
  write(root, "src/utils/old.test.ts", 'import { value } from "./old.js";\n');
  write(root, "src/utils/helper.ts", "export const helper = 1;\n");
  git(root, "add", ".");
  git(root, "-c", "core.hooksPath=/dev/null", "commit", "--quiet", "-m", "fixture");
  return root;
}
const table = [{ from: "utils/old.ts", to: "body/new.ts" }];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("move", () => {
  it("짝 테스트를 내용 그대로 옮기며 git 이 100% rename 으로 찾는다", () => {
    const root = fixture();
    const source = read(root, "src/utils/old.ts");
    const test = read(root, "src/utils/old.test.ts");
    runMoves(root, table, "move");
    expect(read(root, "src/body/new.ts")).toBe(source);
    expect(read(root, "src/body/new.test.ts")).toBe(test);
    expect(existsSync(join(root, "src/utils/old.ts"))).toBe(false);
    const diff = git(root, "diff", "--cached", "--summary", "--find-renames=100%");
    expect(diff).toContain("old.ts => body/new.ts} (100%)");
    expect(diff).toContain("old.test.ts => body/new.test.ts} (100%)");
    git(root, "-c", "core.hooksPath=/dev/null", "commit", "--quiet", "-m", "move");
    expect(git(root, "log", "--follow", "--format=%s", "--", "src/body/new.ts")).toContain("fixture");
  });

  it("짝 테스트를 표에 명시해도 두 번 옮기지 않는다", () => {
    const root = fixture();
    runMoves(root, [...table, { from: "utils/old.test.ts", to: "body/new.test.ts" }], "move");
    expect(existsSync(join(root, "src/body/new.test.ts"))).toBe(true);
  });

  it("뒤 항목의 도착 파일이 있으면 앞 항목도 옮기지 않는다", () => {
    const root = fixture();
    write(root, "src/body/existing.ts", "keep\n");
    expect(() => runMoves(root, [...table, { from: "utils/helper.ts", to: "body/existing.ts" }], "move")).toThrow("도착 파일");
    expect(existsSync(join(root, "src/utils/old.ts"))).toBe(true);
    expect(read(root, "src/body/existing.ts")).toBe("keep\n");
  });

  it.each(["../outside.ts", "/outside.ts", "src/utils/old.ts", "utils/../old.ts", "utils//old.ts", "old.js"])("잘못된 경로 %s 를 거절한다", (from) => {
    const root = fixture();
    expect(() => runMoves(root, [{ from, to: "body/new.ts" }], "move")).toThrow("src 기준");
  });

  it("중복·겹침·미추적 파일과 symlink 를 거절한다", () => {
    const root = fixture();
    expect(() => expandMoves(root, [...table, ...table])).toThrow("중복");
    expect(() => expandMoves(root, [table[0], { from: "body/new.ts", to: "body/next.ts" }])).toThrow("겹치는");
    write(root, "src/utils/untracked.ts", "");
    expect(() => runMoves(root, [{ from: "utils/untracked.ts", to: "body/new.ts" }], "move")).toThrow("git 추적");
    symlinkSync(join(root, "src/utils"), join(root, "src/link"));
    expect(() => runMoves(root, [{ from: "utils/helper.ts", to: "link/new.ts" }], "move")).toThrow("심볼릭 링크");
  });
});

describe("rewrite", () => {
  it("모든 지원 지정자를 옛 위치로 풀고 옮긴 파일의 상대 import 를 고친다", () => {
    const root = fixture();
    write(root, "src/commands/deep/use.ts", [
      'import type { Value } from "../../utils/old.js";',
      'export { value } from "@/utils/old.js";',
      'export type { Value } from "../../utils/old.js";',
      'import "../../utils/old.js";',
      'const lazy = import("../../utils/old.js");',
      'vi.mock("../../utils/old.js", () => ({}));',
      'vi.doMock("@/utils/old.js", () => ({}));',
      'vi.importActual<typeof import("../../utils/old.js")>("../../utils/old.js");',
      'import { helper } from "../../utils/helper.js";',
      '// import { untouched } from "../../utils/old.js";',
      'const example = \'import "../../utils/old.js"\';',
      'const template = `import "../../utils/old.js"`;',
    ].join("\n"));
    const before = read(root, "src/commands/deep/use.ts");
    runMoves(root, table, "move");
    runMoves(root, table, "rewrite");
    const expected = before.split("\n").map((line, i) => i < 8 ? line.replaceAll("../../utils/old.js", "@/body/new.js").replaceAll("@/utils/old.js", "@/body/new.js") : line).join("\n");
    expect(read(root, "src/commands/deep/use.ts")).toBe(expected);
    expect(read(root, "src/body/new.ts")).toContain('from "@/utils/helper.js"');
    expect(read(root, "src/body/new.test.ts")).toContain('from "./new.js"');
    expect(read(root, "src/utils/helper.ts")).toBe("export const helper = 1;\n");
  });

  it("함께 옮긴 파일이 같은 폴더면 ./ 를 쓰고 이동하지 않은 상대 대상도 별칭으로 바꾼다", () => {
    const root = fixture();
    write(root, "src/utils/old.ts", 'import { helper } from "./helper.js";\n');
    runMoves(root, [...table, { from: "utils/helper.ts", to: "body/helper.ts" }], "move");
    runMoves(root, [...table, { from: "utils/helper.ts", to: "body/helper.ts" }], "rewrite");
    expect(read(root, "src/body/new.ts")).toBe('import { helper } from "./helper.js";\n');
  });

  it("문서 검사 범위의 정확한 경로만 고치고 무관한 경로와 문서는 지킨다", () => {
    const root = fixture();
    const before = '`src/utils/old.ts`, src/utils/old.js. src/utils/old\nsrc/utils/old.tsx src/utils/old.test.ts\nother/src/utils/old.ts\n';
    for (const file of ["docs/adr/x.md", "CLAUDE.md", "README.md", "CONTRIBUTING.md", ".claude/example.md", "skills/example/SKILL.md"]) write(root, file, before);
    write(root, "other.md", before);
    runMoves(root, table, "move");
    runMoves(root, table, "rewrite");
    for (const file of ["docs/adr/x.md", "CLAUDE.md", "README.md", "CONTRIBUTING.md", ".claude/example.md", "skills/example/SKILL.md"]) {
      expect(read(root, file)).toBe('`src/body/new.ts`, src/body/new.js. src/body/new\nsrc/utils/old.tsx src/body/new.test.ts\nother/src/utils/old.ts\n');
    }
    expect(read(root, "other.md")).toBe(before);
  });

  it("move 전에는 rewrite 가 실패하고 파일은 그대로다", () => {
    const root = fixture();
    const source = read(root, "src/utils/old.ts");
    expect(() => runMoves(root, table, "rewrite")).toThrow("먼저 move");
    expect(read(root, "src/utils/old.ts")).toBe(source);
  });

  it("빈 표와 재실행은 변경을 만들지 않는다", () => {
    const root = fixture();
    runMoves(root, [], "move");
    runMoves(root, [], "rewrite");
    expect(git(root, "status", "--porcelain")).toBe("");
    runMoves(root, table, "move");
    runMoves(root, table, "rewrite");
    const source = read(root, "src/body/new.ts");
    runMoves(root, table, "rewrite");
    expect(read(root, "src/body/new.ts")).toBe(source);
  });
});

describe("CLI", () => {
  it("두 단계를 실행하고 잘못된 인자·표는 실패 종료 코드를 낸다", () => {
    const root = fixture();
    write(root, "moves.json", JSON.stringify(table));
    for (const step of ["move", "rewrite"]) {
      const result = spawnSync(process.execPath, [script, "moves.json", "--step", step], { cwd: root, encoding: "utf8" });
      expect(result.status, result.stderr).toBe(0);
    }
    for (const args of [[], ["moves.json", "--step", "wrong"], ["moves.json", "--step", "move", "extra"], ["missing.json", "--step", "rewrite"]]) {
      expect(spawnSync(process.execPath, [script, ...args], { cwd: root }).status).toBe(1);
    }
    write(root, "moves.json", "{}");
    expect(spawnSync(process.execPath, [script, "moves.json", "--step", "move"], { cwd: root }).status).toBe(1);
  });
});
