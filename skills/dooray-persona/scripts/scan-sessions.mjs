import { createReadStream } from "node:fs";
import { readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { loadPersonaConfig, parseArgs } from "./lib/config.mjs";

function sanitizeForTerminal(value) {
  return String(value).replace(/[\u0000-\u001f\u007f]/g, "?");
}

function isMissingPath(error) {
  return (
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

async function findJsonlFiles(root) {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (isMissingPath(error)) return [];
    throw error;
  }

  const files = [];
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await findJsonlFiles(path)));
    } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      files.push(path);
    }
  }
  return files;
}

function parseJsonLines(contents, sourcePath) {
  return contents
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "")
    .map((line, index) => {
      try {
        const entry = JSON.parse(line);
        if (!entry || typeof entry !== "object" || typeof entry.id !== "string") {
          throw new Error("id 필드가 없습니다.");
        }
        return entry;
      } catch (error) {
        throw new Error(
          `${sourcePath} ${index + 1}번째 줄을 읽을 수 없습니다: ${error?.message ?? error}`,
        );
      }
    });
}

const COMMENT_ID_PATTERN = /댓글이 추가되었습니다:\s*([A-Za-z0-9_-]+)/g;

function collectCommentIds(contents, ids) {
  for (const match of contents.matchAll(COMMENT_ID_PATTERN)) {
    ids.add(match[1]);
  }
}

/**
 * 세션 로그를 줄 단위로 훑는다.
 * 대화가 길어진 jsonl 은 파일 하나가 수십 MB 까지 커지는데 필요한 줄은 극소수다.
 * 파일째 읽으면 메모리가 파일 크기에 비례하므로 스트림으로 상수 메모리를 유지한다.
 */
async function collectCommentIdsFromFile(path, ids) {
  const reader = createInterface({
    input: createReadStream(path, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  try {
    for await (const line of reader) {
      if (line.includes("댓글이 추가되었습니다:")) {
        collectCommentIds(line, ids);
      }
    }
  } finally {
    reader.close();
  }
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
  const { config, exists } = await loadPersonaConfig(args.configPath);
  if (!exists) {
    process.stderr.write("설정 파일이 없어 세션 로그 대조를 건너뜁니다.\n");
    return;
  }
  if (!config.sessionScan.enabled) {
    process.stderr.write("세션 로그 대조가 비활성화되어 건너뜁니다.\n");
    return;
  }

  const files = (
    await Promise.all(config.sessionScan.roots.map((root) => findJsonlFiles(root)))
  ).flat();
  if (files.length === 0) {
    process.stderr.write("세션 로그 파일이 없어 대조를 건너뜁니다.\n");
    return;
  }

  const commentIds = new Set();
  for (const file of files) {
    await collectCommentIdsFromFile(file, commentIds);
  }

  const outDir = args.outDir ?? config.workDir;
  const classifiedPath = join(outDir, "classified.jsonl");
  const entries = parseJsonLines(
    await readFile(classifiedPath, "utf8"),
    classifiedPath,
  );
  let confirmed = 0;
  const updated = entries.map((entry) => {
    const match = entry.id.match(/#log-(.+)$/);
    if (!match || !commentIds.has(match[1])) return entry;
    confirmed += 1;
    return { ...entry, label: "ai-confirmed", confirmed: true };
  });
  const serialized =
    updated.map((entry) => JSON.stringify(entry)).join("\n") +
    (updated.length > 0 ? "\n" : "");

  await writePrivateFile(classifiedPath, serialized);
  process.stdout.write(`${JSON.stringify({ sessionFiles: files.length, confirmed })}\n`);
}

main().catch((error) => {
  process.stderr.write(
    `세션 대조 실패: ${sanitizeForTerminal(error?.message ?? error)}\n`,
  );
  process.exitCode = 1;
});
