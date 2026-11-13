import { readFile, writeFile, mkdir, rename, chmod, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
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
  const dir = join(homedir(), ".dooray");
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await chmod(dir, 0o700).catch(() => undefined);
  const tmp = `${LAST_RUN_PATH}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(tmp, JSON.stringify(data, null, 2) + "\n", { mode: 0o600, flag: "wx" });
    await rename(tmp, LAST_RUN_PATH);
  } catch (err) {
    await unlink(tmp).catch(() => undefined);
    throw err;
  }
}
