import path from "node:path";
import { homedir } from "node:os";
import type { SkillManagerContext } from "./manager.js";
import { CLI_VERSION } from "../version.js";

export function resolveSkillDataRoot(
  homeDir: string,
  xdgDataHome = process.env.XDG_DATA_HOME,
): string {
  if (xdgDataHome != null && path.isAbsolute(xdgDataHome)) {
    return path.join(xdgDataHome, "dooray-cli");
  }

  return path.join(homeDir, ".local", "share", "dooray-cli");
}

export function createSkillManagerContext(): SkillManagerContext {
  const homeDir = homedir();

  return {
    homeDir,
    packageRoot: path.resolve(__dirname, ".."),
    currentVersion: CLI_VERSION,
    dataRoot: resolveSkillDataRoot(homeDir),
  };
}
