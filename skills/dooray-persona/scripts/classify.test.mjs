import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const SCRIPTS = fileURLToPath(new URL(".", import.meta.url));

let dir;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "persona-classify-"));
  const workDir = join(dir, "work");
  await mkdir(workDir);
  await writeFile(
    join(workDir, "corpus.jsonl"),
    ["p1#body", "p2#log-c2"]
      .map((id) => JSON.stringify({ id, subject: `제목 ${id}`, text: "확인했습니다. 내일 반영하겠습니다." }))
      .join("\n") + "\n",
  );
  await writeFile(
    join(dir, "config.json"),
    JSON.stringify({
      version: 1,
      targets: [],
      outputPath: join(dir, "persona.md"),
      workDir,
      since: null,
      sessionScan: { enabled: false, roots: [] },
    }),
  );
});
afterEach(() => rm(dir, { recursive: true, force: true }));

function runClassify() {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [join(SCRIPTS, "classify.mjs"), "--config", join(dir, "config.json")],
      (error, stdout, stderr) => resolve({ code: error?.code ?? 0, stdout, stderr }),
    );
  });
}

describe("classify.mjs", () => {
  it("다시 분류해도 확정(confirmed)한 항목의 라벨을 남긴다", async () => {
    expect((await runClassify()).code).toBe(0);
    const path = join(dir, "work", "classified.jsonl");
    const rows = (await readFile(path, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
    expect(rows.every((row) => row.confirmed === false)).toBe(true);

    // 사용자가 두 번째 항목을 확정한다.
    rows[1] = { ...rows[1], label: "ai-confirmed", confirmed: true };
    await writeFile(path, rows.map((row) => JSON.stringify(row)).join("\n") + "\n");

    expect((await runClassify()).code).toBe(0);
    const again = (await readFile(path, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
    expect(again[1]).toMatchObject({ id: "p2#log-c2", label: "ai-confirmed", confirmed: true });
    expect(again[0].confirmed).toBe(false);
  });
});
