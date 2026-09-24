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
  const result = spawnSync(command, spawnArgs, { encoding: "utf8", shell: useShell, ...opts });
  return {
    status: result.status ?? -1,
    signal: result.signal ?? null,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error,
  };
}

export function repoRoot() {
  const result = run("git", ["rev-parse", "--show-toplevel"]);
  return result.status === 0 ? result.stdout.trim() || null : null;
}
