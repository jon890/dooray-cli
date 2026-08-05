#!/usr/bin/env node

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const packageJson = JSON.parse(await readFile("package.json", "utf8"));

if (
  packageJson == null ||
  typeof packageJson !== "object" ||
  !("version" in packageJson) ||
  typeof packageJson.version !== "string"
) {
  console.error("package.json version must be a string");
  process.exit(1);
}

const expectedVersion = packageJson.version;

const failures = [];

const versionResult = spawnSync(process.execPath, ["dist/index.js", "--version"], {
  encoding: "utf8",
});

if (versionResult.status !== 0) {
  failures.push(
    `node dist/index.js --version failed with exit ${versionResult.status ?? "null"}`,
  );
} else {
  const actualVersion = versionResult.stdout.trim();
  if (actualVersion !== expectedVersion) {
    failures.push(
      `dist version mismatch: expected ${expectedVersion}, got ${actualVersion}`,
    );
  }
}

const requiredFiles = [
  "skills/dooray-cli/SKILL.md",
  "skills/dooray-cli/references/common.md",
  "skills/dooray-cli/references/comment.md",
  "skills/dooray-cli/references/mention-link.md",
  "skills/dooray-cli/references/post.md",
  "skills/dooray-cli/references/wiki.md",
  "skills/dooray-cli/references/workflow.md",
];

for (const requiredFile of requiredFiles) {
  if (!existsSync(join(process.cwd(), requiredFile))) {
    failures.push(`missing package skill file: ${requiredFile}`);
  }
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(failure);
  }
  process.exit(1);
}
