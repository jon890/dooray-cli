import type { LastRun } from "../cache/last-run.js";

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

export function buildLastRunBlock(last: LastRun): string {
  return [
    "## 직전 실행 (자동 첨부)",
    "",
    "```",
    `$ ${last.argv.join(" ")}`,
    last.errorMessage.replace(/```/g, "'''"),
    "```",
    "",
    `- exit code: ${last.exitCode}`,
    `- 시각: ${last.timestamp}`,
  ].join("\n");
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
