// health-check 스크립트가 공유하는 helper.
//
// 저장소 root 를 스스로 찾고, 자식 프로세스의 종료 코드를 그 자리에서 읽는다.
// Windows 에서는 pnpm 이 pnpm.cmd 라서 shell 없이 spawn 하면 ENOENT 가 난다.

import { spawnSync } from "node:child_process";

const IS_WIN = process.platform === "win32";

export function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    shell: IS_WIN && cmd !== process.execPath,
    ...opts,
  });
  return {
    status: r.status ?? (r.error ? -1 : 0),
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
