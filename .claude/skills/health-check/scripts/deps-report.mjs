#!/usr/bin/env node
// 의존성 상태를 측정해 Markdown 으로 출력한다.
//
//   node .claude/skills/health-check/scripts/deps-report.mjs [--json]
//
// 출력하는 것
//   - 낡은 의존성: 범위 안 갱신(wanted)으로 되는 것과 메이저를 넘어야 하는 것을 나눈다
//   - 취약점: 사용자 설치본에 들어가는 런타임 경로와 개발 도구 경로를 나눈다
//     pnpm audit 의 finding.dev 가 그 구분이다
//   - 취약점마다 어느 직접 의존성을 거쳐 들어오는지(경로의 첫 패키지)
//
// 종료 코드
//   0  낡은 의존성도 취약점도 없다
//   1  하나 이상 있다
//   2  저장소 root 나 pnpm 을 찾지 못했거나 pnpm 출력을 읽지 못했다

import { readFileSync } from "node:fs";
import { classifyAdvisories, enterRepoRoot, majorOf, parseAuditReport, parseJsonOrNull, run } from "./lib.mjs";

function main() {
  enterRepoRoot();
  const asJson = process.argv.includes("--json");

  const pkg = JSON.parse(readFileSync("package.json", "utf8"));

// pnpm outdated 는 낡은 것이 있으면 종료 코드 1 을 낸다. 1 은 정상 결과로 본다.
const outdatedRun = run("pnpm", ["outdated", "--format", "json"]);
if (outdatedRun.status !== 0 && outdatedRun.status !== 1) {
  console.error(`pnpm outdated 실패 (종료 코드 ${outdatedRun.status})\n${outdatedRun.stderr}`);
  process.exit(2);
}
const outdatedRaw = outdatedRun.stdout.trim() === "" ? {} : parseJsonOrNull(outdatedRun.stdout);
if (outdatedRaw === null) {
  console.error("pnpm outdated 의 JSON 출력을 읽지 못했다.");
  process.exit(2);
}

const outdated = Object.entries(outdatedRaw).map(([name, o]) => {
  const curMajor = majorOf(o.current);
  const latestMajor = majorOf(o.latest);
  return {
    name,
    type: o.dependencyType === "devDependencies" ? "dev" : "runtime",
    current: o.current,
    wanted: o.wanted,
    latest: o.latest,
    deprecated: Boolean(o.isDeprecated),
    // wanted 는 lockfile 기준이라 current 와 같게 나오기도 한다. 판정은 메이저 비교로 한다.
    kind: curMajor !== null && latestMajor !== null && latestMajor > curMajor ? "major" : "in-range",
  };
});

// pnpm audit 도 취약점이 있으면 1 을 낸다.
const auditRun = run("pnpm", ["audit", "--json"]);
const audit = parseAuditReport(auditRun.stdout);
if (!audit) {
  console.error(`pnpm audit 의 JSON 출력을 읽지 못했다 (종료 코드 ${auditRun.status})\n${auditRun.stderr}`);
  process.exit(2);
}
const advisories = classifyAdvisories(audit, pkg);

const result = {
  engines: pkg.engines ?? {},
  outdated,
  advisories,
  summary: {
    outdatedInRange: outdated.filter((o) => o.kind === "in-range").length,
    outdatedMajor: outdated.filter((o) => o.kind === "major").length,
    deprecated: outdated.filter((o) => o.deprecated).length,
    runtimeAdvisories: advisories.filter((a) => a.scope === "runtime").length,
    devAdvisories: advisories.filter((a) => a.scope === "dev").length,
    bySeverity: audit.metadata?.vulnerabilities ?? {},
  },
};

if (asJson) {
  console.log(JSON.stringify(result, null, 2));
} else {
  const s = result.summary;
  const lines = [];
  lines.push("# 의존성 측정");
  lines.push("");
  lines.push(`- 범위 안 갱신 대상 ${s.outdatedInRange}개, 메이저 갱신 대상 ${s.outdatedMajor}개, deprecated ${s.deprecated}개`);
  lines.push(`- 취약점: 런타임 경로 ${s.runtimeAdvisories}건, 개발 도구 경로 ${s.devAdvisories}건`);
  const sev = Object.entries(s.bySeverity).filter(([, n]) => n > 0).map(([k, n]) => `${k} ${n}`).join(", ");
  lines.push(`- 등급별: ${sev || "없음"}`);
  lines.push(`- engines.node: ${result.engines.node ?? "(없음)"}`);
  lines.push("");

  if (outdated.length > 0) {
    lines.push("## 낡은 의존성");
    lines.push("");
    lines.push("| 패키지 | 구분 | 현재 | 최신 | 갱신 종류 |");
    lines.push("| --- | --- | --- | --- | --- |");
    for (const o of [...outdated].sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name))) {
      const kind = o.kind === "major" ? "메이저" : "범위 안";
      lines.push(`| \`${o.name}\` | ${o.type} | ${o.current} | ${o.latest}${o.deprecated ? " (deprecated)" : ""} | ${kind} |`);
    }
    lines.push("");
  }

  if (advisories.length > 0) {
    lines.push("## 취약점");
    lines.push("");
    lines.push("| 경로 | 등급 | 패키지 | 설치 | 수정 | 거쳐 오는 직접 의존성 | 내용 |");
    lines.push("| --- | --- | --- | --- | --- | --- | --- |");
    for (const a of advisories) {
      const scope = a.scope === "runtime" ? "런타임" : "개발";
      const title = a.title.replace(/\|/g, "\\|");
      lines.push(`| ${scope} | ${a.severity} | \`${a.module}\` | ${a.installed} | ${a.patched} | ${a.via.map((v) => `\`${v}\``).join(", ")} | [${a.id}](${a.url}) ${title} |`);
    }
    lines.push("");
  }

  console.log(lines.join("\n"));
}

  process.exit(outdated.length + advisories.length > 0 ? 1 : 0);
}

try {
  main();
} catch (error) {
  console.error(`의존성 측정을 실행하지 못했다: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
}
