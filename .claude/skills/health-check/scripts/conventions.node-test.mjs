// Vitest 수집 범위와 분리해 node --test 로 실행한다.
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "conventions.mjs");

function write(root, path, text) {
  const file = join(root, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
}

function fixture(files = {}) {
  const root = mkdtempSync(join(tmpdir(), "conventions-test-"));
  spawnSync("git", ["init", "--quiet", root]);
  const base = {
    "package.json": JSON.stringify({ name: "fixture", version: "1", engines: { node: ">=20" } }),
    "tsup.config.ts": 'export default { target: ["node20"] };\n',
    ".github/workflows/ci.yml": "jobs:\n  test:\n    strategy:\n      matrix:\n        node-version: [20, 22]\n",
    ".gitattributes": "* text=auto eol=lf\n",
    "src/index.ts": "export {};\n",
    ...files,
  };
  for (const [path, text] of Object.entries(base)) write(root, path, text);
  return root;
}

function inspect(root) {
  const result = spawnSync(process.execPath, [SCRIPT, "--json"], { cwd: root, encoding: "utf8" });
  assert.notEqual(result.status, 2, result.stderr);
  const rules = JSON.parse(result.stdout).rules;
  return Object.fromEntries(rules.map((rule) => [rule.id, rule]));
}

test("규칙별 검출과 비검출 표본", () => {
  const root = fixture({
    "src/commands/group/index.ts": "export {};\n",
    "src/commands/run.ts": `
// process.exit(1)
// globalThis.fetch("comment")
// throw Error("comment")
process.exit (1);
globalThis.fetch ("a");
fetch ("b");
throw Error("a");
throw new Error("b");
import type { Transport } from "nodemailer/lib/example.js";
import {
  createTransport,
} from "nodemailer/lib/example.js";
export type { ImapFlow } from "imapflow";
export {
  ImapFlow,
} from "imapflow/lib/example.js";
`,
    "src/commands/run.test.ts": "export {};\n",
    "src/commands/missing.ts": "export {};\n",
    "src/config/files.ts": `
writeFile(
  path,
  data,
  {
    encoding: "utf8",
    mode: 0o600,
  },
);
appendFile(path, data);
createWriteStream(path, {
  mode: 0o600,
});
createWriteStream(otherPath);
`,
  });
  try {
    const rules = inspect(root);
    assert.equal(rules["process-exit"].count, 1);
    assert.equal(rules["raw-fetch"].count, 2);
    assert.equal(rules["plain-error"].count, 2);
    assert.equal(rules["sensitive-write-mode"].count, 2);
    assert.equal(rules["static-heavy-import"].count, 2);
    assert.equal(rules["node-version-alignment"].count, 0);
    assert.deepEqual(rules["command-tests"].hits.map((hit) => hit.at), ["src/commands/missing.ts"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Node 버전 세 값 중 읽지 못한 값을 각각 보고한다", () => {
  const root = fixture({
    "package.json": JSON.stringify({ name: "fixture", version: "1" }),
    "tsup.config.ts": "export default {};\n",
    ".github/workflows/ci.yml": "jobs: {}\n",
  });
  try {
    const rule = inspect(root)["node-version-alignment"];
    assert.equal(rule.count, 3);
    assert.match(rule.hits.map((hit) => hit.line).join("\n"), /engines\.node 읽지 못함/);
    assert.match(rule.hits.map((hit) => hit.line).join("\n"), /빌드 target 읽지 못함/);
    assert.match(rule.hits.map((hit) => hit.line).join("\n"), /CI Node 버전 읽지 못함/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
