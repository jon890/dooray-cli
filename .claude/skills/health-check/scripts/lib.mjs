// health-check 스크립트가 공유하는 helper.
//
// 저장소 root 를 스스로 찾고, 자식 프로세스의 종료 코드를 그 자리에서 읽는다.
// Windows 에서는 pnpm 과 npm 이 .cmd 라서 shell 없이 spawn 하면 ENOENT 가 난다.

import { spawnSync } from "node:child_process";

const IS_WIN = process.platform === "win32";
const WINDOWS_SHELL_COMMANDS = new Set(["pnpm", "npm"]);

function quoteWindowsArg(arg) {
  const value = String(arg);
  return `"${value.replace(/(\\*)"/g, "$1$1\\\"").replace(/(\\+)$/g, "$1$1")}"`;
}

export function run(cmd, args, opts = {}) {
  const useShell = IS_WIN && WINDOWS_SHELL_COMMANDS.has(cmd);
  const command = useShell ? [cmd, ...args.map(quoteWindowsArg)].join(" ") : cmd;
  const spawnArgs = useShell ? [] : args;
  const r = spawnSync(command, spawnArgs, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    shell: useShell,
    ...opts,
  });
  return {
    status: r.status ?? -1,
    signal: r.signal ?? null,
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
    error: r.error,
  };
}

export function repoRoot(cwd = process.cwd()) {
  const r = run("git", ["rev-parse", "--show-toplevel"], { cwd });
  if (r.status !== 0) return null;
  return r.stdout.trim() || null;
}

export function enterRepoRoot() {
  const root = repoRoot();
  if (!root) {
    console.error("git 저장소 안에서 실행한다.");
    process.exit(2);
  }
  process.chdir(root);
  return root;
}

export function parseJsonOrNull(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function majorOf(version) {
  const m = /^(\d+)/.exec(version ?? "");
  return m ? Number(m[1]) : null;
}

const SEVERITY_ORDER = ["critical", "high", "moderate", "low", "info"];
export function severityRank(s) {
  const i = SEVERITY_ORDER.indexOf(s);
  return i === -1 ? SEVERITY_ORDER.length : i;
}

export function parseAuditReport(text) {
  const audit = parseJsonOrNull(text);
  if (!audit || typeof audit !== "object" || audit.error) return null;
  if (!audit.metadata || typeof audit.metadata.vulnerabilities !== "object") return null;
  return audit;
}

export function classifyAdvisories(audit, pkg) {
  const directDeps = new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
  ]);

  const advisories = Object.values(audit.advisories ?? {}).map((a) => {
    const findings = a.findings ?? [];
    const paths = findings.flatMap((f) => f.paths ?? []);
    const via = [...new Set(paths.map((p) => p.split(">")[1]).filter(Boolean))];
    return {
      id: a.github_advisory_id ?? String(a.id),
      module: a.module_name,
      severity: a.severity,
      title: a.title,
      installed: [...new Set(findings.map((f) => f.version))].join(", "),
      patched: a.patched_versions,
      scope: findings.some((f) => f.dev === false) ? "runtime" : "dev",
      via,
      direct: directDeps.has(a.module_name),
      url: a.url,
    };
  });
  advisories.sort(
    (x, y) =>
      (x.scope === y.scope ? 0 : x.scope === "runtime" ? -1 : 1) ||
      severityRank(x.severity) - severityRank(y.severity) ||
      x.module.localeCompare(y.module),
  );
  return advisories;
}
