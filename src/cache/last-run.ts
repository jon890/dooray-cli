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

export async function readLastRun(): Promise<LastRun | null> {
  try {
    const raw = await readFile(LAST_RUN_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    if (
      Array.isArray(parsed?.argv) &&
      parsed.argv.every((a: unknown) => typeof a === "string") &&
      typeof parsed?.exitCode === "number" &&
      typeof parsed?.errorMessage === "string" &&
      typeof parsed?.timestamp === "string"
    ) {
      return parsed as LastRun;
    }
    return null;
  } catch {
    return null;
  }
}

export async function writeLastRun(data: LastRun): Promise<void> {
  await mkdir(join(homedir(), ".dooray"), { recursive: true });
  const tmp = LAST_RUN_PATH + ".tmp";
  await writeFile(tmp, JSON.stringify(data, null, 2) + "\n");
  await rename(tmp, LAST_RUN_PATH);
}
