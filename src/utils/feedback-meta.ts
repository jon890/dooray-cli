import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export async function readCliVersion(): Promise<string> {
  const entry = process.argv[1];
  const here = entry ? dirname(entry) : process.cwd();
  const candidates = [
    join(here, "package.json"),
    join(here, "..", "package.json"),
    join(here, "..", "..", "package.json"),
  ];
  for (const p of candidates) {
    try {
      const raw = await readFile(p, "utf-8");
      const pkg = JSON.parse(raw);
      if (pkg.name === "@bifos/dooray-cli" && typeof pkg.version === "string") {
        return pkg.version;
      }
    } catch {
      // 다음 후보
    }
  }
  return "unknown";
}

export interface FeedbackMeta {
  cliVersion: string;
  nodeVersion: string;
  os: string;
  arch: string;
}

export function collectMeta(version: string): FeedbackMeta {
  return {
    cliVersion: version,
    nodeVersion: process.version,
    os: process.platform,
    arch: process.arch,
  };
}

export function buildIssueBody(userBody: string, meta: FeedbackMeta): string {
  return [
    "## 환경",
    `- dooray-cli 버전: ${meta.cliVersion}`,
    `- Node: ${meta.nodeVersion}`,
    `- OS: ${meta.os} ${meta.arch}`,
    "",
    "## 사용자 피드백",
    "",
    userBody.trim(),
    "",
  ].join("\n");
}
