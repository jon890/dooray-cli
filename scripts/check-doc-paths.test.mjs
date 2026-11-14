import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { extractSrcPaths, findStalePaths, pathExists } from "./check-doc-paths.mjs";

const roots = [];
function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), "dooray-doc-paths-"));
  roots.push(root);
  mkdirSync(join(root, "src/api"), { recursive: true });
  writeFileSync(join(root, "src/api/client.ts"), "");
  mkdirSync(join(root, "docs/adr"), { recursive: true });
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("extractSrcPaths", () => {
  it("문장 부호와 자리표시 앞에서 끊고 glob 은 건너뛴다", () => {
    expect(extractSrcPaths("`src/api/client.ts`, 그리고 src/api/<영역>/types.ts. 범위 src/**/*.ts")).toEqual([
      "src/api/client.ts",
      "src/api/",
    ]);
  });

  it("다른 경로 안의 src 는 뽑지 않는다", () => {
    expect(extractSrcPaths("skills/x/src/a.ts 와 docs/src-map.md")).toEqual([]);
  });
});

describe("pathExists", () => {
  it(".js 는 .ts 로, 확장자 없는 경로는 .ts 를 붙여 찾는다", () => {
    const root = makeRoot();
    expect(pathExists(root, "src/api/client.js")).toBe(true);
    expect(pathExists(root, "src/api/client")).toBe(true);
    expect(pathExists(root, "src/api/")).toBe(true);
    expect(pathExists(root, "src/api/types.ts")).toBe(false);
  });
});

describe("findStalePaths", () => {
  it("없는 파일을 가리키는 줄을 문서와 줄 번호로 낸다", () => {
    const root = makeRoot();
    writeFileSync(join(root, "docs/adr/001-x.md"), "첫 줄\n`src/api/client.ts` 는 있다\n`src/api/old.ts` 는 없다\n");
    writeFileSync(join(root, "CLAUDE.md"), "src/utils/gone.ts\n");
    expect(findStalePaths(root)).toEqual([
      { file: "CLAUDE.md", line: 1, path: "src/utils/gone.ts" },
      { file: "docs/adr/001-x.md", line: 3, path: "src/api/old.ts" },
    ]);
  });
});
