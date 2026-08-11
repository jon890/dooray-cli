import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { loadPersonaConfig, parseArgs } from "./lib/config.mjs";
import { calculateStats } from "./lib/stats.mjs";

function sanitizeForTerminal(value) {
  return String(value).replace(/[\u0000-\u001f\u007f]/g, "?");
}

function parseJsonLines(contents, sourcePath) {
  return contents
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "")
    .map((line, index) => {
      try {
        const entry = JSON.parse(line);
        if (
          !entry ||
          typeof entry !== "object" ||
          typeof entry.label !== "string" ||
          typeof entry.assigneeKind !== "string" ||
          typeof entry.text !== "string"
        ) {
          throw new Error("통계 필수 필드가 없습니다.");
        }
        return entry;
      } catch (error) {
        throw new Error(
          `${sourcePath} ${index + 1}번째 줄을 읽을 수 없습니다: ${error?.message ?? error}`,
        );
      }
    });
}

async function writePrivateFile(path, contents) {
  const temporaryPath = join(
    dirname(path),
    `.${basename(path)}.${process.pid}.tmp`,
  );
  try {
    await writeFile(temporaryPath, contents, { mode: 0o600 });
    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.flags.length > 0) {
    throw new Error(`알 수 없는 옵션입니다: ${args.flags[0]}`);
  }
  const { config } = await loadPersonaConfig(args.configPath);
  const outDir = args.outDir ?? config.workDir;
  const classifiedPath = join(outDir, "classified.jsonl");
  const entries = parseJsonLines(
    await readFile(classifiedPath, "utf8"),
    classifiedPath,
  );
  const output = {
    generatedAt: new Date().toISOString(),
    ...calculateStats(entries),
  };
  const serialized = `${JSON.stringify(output, null, 2)}\n`;

  await mkdir(outDir, { recursive: true, mode: 0o700 });
  await writePrivateFile(join(outDir, "stats.json"), serialized);
  process.stdout.write(serialized);
}

main().catch((error) => {
  process.stderr.write(
    `통계 생성 실패: ${sanitizeForTerminal(error?.message ?? error)}\n`,
  );
  process.exitCode = 1;
});
