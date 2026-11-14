import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { preserveConfirmed } from "./lib/classified.mjs";
import { loadPersonaConfig, parseArgs } from "./lib/config.mjs";
import {
  buildSubjectShapeIndex,
  extractSignals,
  labelEntry,
} from "./lib/signals.mjs";

function sanitizeForTerminal(value) {
  return String(value).replace(/[\u0000-\u001f\u007f]/g, "?");
}

function hasReportFlag(flags) {
  for (const flag of flags) {
    if (flag !== "--report") throw new Error(`알 수 없는 옵션입니다: ${flag}`);
  }
  return flags.includes("--report");
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
          typeof entry.id !== "string" ||
          typeof entry.subject !== "string" ||
          typeof entry.text !== "string"
        ) {
          throw new Error("필수 필드가 없습니다.");
        }
        return entry;
      } catch (error) {
        throw new Error(
          `${sourcePath} ${index + 1}번째 줄을 읽을 수 없습니다: ${error?.message ?? error}`,
        );
      }
    });
}

async function readPreviousClassified(path) {
  let contents;
  try {
    contents = await readFile(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  // 읽을 수 없는 파일을 빈 것으로 보고 덮어쓰면 확정 결과가 사라진다. 그래서 파싱 오류는 그대로 멈춘다.
  return parseJsonLines(contents, path);
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

function topSignals(signals) {
  return Object.entries(signals)
    .filter(([name, value]) => name !== "chars" && value > 0)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 3)
    .reduce((result, [name, value]) => ({ ...result, [name]: value }), {});
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = hasReportFlag(args.flags);
  const { config } = await loadPersonaConfig(args.configPath);
  const outDir = args.outDir ?? config.workDir;
  const corpusPath = join(outDir, "corpus.jsonl");
  const entries = parseJsonLines(await readFile(corpusPath, "utf8"), corpusPath);
  const subjectShapeIndex = buildSubjectShapeIndex(entries);
  const decisions = entries.map((entry) => {
    const signals = extractSignals(entry.text);
    return {
      entry,
      signals,
      decision: labelEntry(entry, signals, subjectShapeIndex),
    };
  });
  const classifiedPath = join(outDir, "classified.jsonl");
  const previous = await readPreviousClassified(classifiedPath);
  const { entries: classified, preserved } = preserveConfirmed(
    decisions.map(({ entry, signals, decision }) => ({
      ...entry,
      label: decision.label,
      signals,
      confirmed: false,
    })),
    previous,
  );
  if (preserved > 0) {
    process.stderr.write(`확정된 ${preserved}건의 라벨을 그대로 유지했습니다.\n`);
  }
  const serialized =
    classified.map((entry) => JSON.stringify(entry)).join("\n") +
    (classified.length > 0 ? "\n" : "");

  await mkdir(outDir, { recursive: true, mode: 0o700 });
  await writePrivateFile(classifiedPath, serialized);

  if (report) {
    const counts = { human: 0, "ai-suspect": 0, "formal-template": 0 };
    for (const entry of classified) counts[entry.label] = (counts[entry.label] ?? 0) + 1;
    const confirmedIds = new Set(
      classified.filter((entry) => entry.confirmed).map((entry) => entry.id),
    );
    process.stdout.write(
      `${JSON.stringify({
        counts,
        needsReview: decisions
          .filter(
            ({ decision, entry }) =>
              decision.needsReview && !confirmedIds.has(entry.id),
          )
          .map(({ entry, signals }) => ({
            id: entry.id,
            subject: entry.subject,
            topSignals: topSignals(signals),
          })),
      })}\n`,
    );
  }
}

main().catch((error) => {
  process.stderr.write(
    `분류 실패: ${sanitizeForTerminal(error?.message ?? error)}\n`,
  );
  process.exitCode = 1;
});
