import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

const LAST_RUN_PATH = join(homedir(), ".dooray", "last-run.json");

export interface LastRun {
  argv: string[];           // sanitized
  exitCode: number;
  errorMessage: string;
  timestamp: string;        // ISO 8601
}

function isLastRun(obj: unknown): obj is LastRun {
  if (typeof obj !== "object" || obj === null) return false;
  const o = obj as Record<string, unknown>;
  return (
    Array.isArray(o.argv) &&
    o.argv.every((a) => typeof a === "string") &&
    typeof o.exitCode === "number" &&
    typeof o.errorMessage === "string" &&
    typeof o.timestamp === "string"
  );
}

export async function readLastRun(): Promise<LastRun | null> {
  try {
    const raw = await readFile(LAST_RUN_PATH, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    return isLastRun(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function writeLastRun(data: LastRun): Promise<void> {
  await mkdir(join(homedir(), ".dooray"), { recursive: true });
  const tmp = LAST_RUN_PATH + ".tmp";
  await writeFile(tmp, JSON.stringify(data, null, 2) + "\n", { mode: 0o600 });
  await rename(tmp, LAST_RUN_PATH);
}
