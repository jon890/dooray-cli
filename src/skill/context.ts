import path from "node:path";
import { homedir } from "node:os";
import type { SkillManagerContext } from "./manager.js";
import { CLI_VERSION } from "../version.js";

export function createSkillManagerContext(): SkillManagerContext {
  return {
    homeDir: homedir(),
    packageRoot: path.resolve(__dirname, ".."),
    currentVersion: CLI_VERSION,
  };
}
