import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

function expandHome(path) {
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return join(homedir(), path.slice(2));
  return path;
}

function requireOptionValue(argv, index, option) {
  const value = argv[index + 1];
  if (value == null || value.startsWith("--")) {
    throw new Error(`${option} 뒤에 경로를 입력하세요.`);
  }
  return value;
}

export function parseArgs(argv) {
  let configPath = join(homedir(), ".claude", "dooray-persona.config.json");
  let outDir = null;
  const flags = [];

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--config") {
      configPath = expandHome(
        requireOptionValue(argv, index, "--config"),
      );
      index += 1;
    } else if (argument === "--out") {
      outDir = expandHome(requireOptionValue(argv, index, "--out"));
      index += 1;
    } else {
      flags.push(argument);
    }
  }

  return { configPath, outDir, flags };
}

function defaultConfig() {
  return {
    version: 1,
    targets: [],
    outputPath: join(homedir(), ".claude", "dooray-persona.md"),
    workDir: join(homedir(), ".local", "share", "dooray-persona"),
    since: null,
    sessionScan: {
      enabled: true,
      roots: [join(homedir(), ".claude", "projects")],
    },
  };
}

function isMissingFile(error) {
  return (
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

function normalizeTargets(targets) {
  if (!Array.isArray(targets)) {
    throw new Error("설정 targets는 배열이어야 합니다.");
  }

  const seenProjectIds = new Set();
  return targets.map((target, index) => {
    if (
      !target ||
      typeof target !== "object" ||
      typeof target.projectId !== "string" ||
      target.projectId.trim() === "" ||
      typeof target.code !== "string" ||
      target.code.trim() === "" ||
      typeof target.name !== "string" ||
      target.name.trim() === ""
    ) {
      throw new Error(`설정 targets[${index}]의 형식이 올바르지 않습니다.`);
    }
    if (seenProjectIds.has(target.projectId)) {
      throw new Error(`설정 targets의 projectId가 중복됩니다: ${target.projectId}`);
    }
    seenProjectIds.add(target.projectId);
    return {
      projectId: target.projectId,
      code: target.code,
      name: target.name,
    };
  });
}

export async function loadPersonaConfig(configPath) {
  const defaults = defaultConfig();
  let parsed;

  try {
    parsed = JSON.parse(await readFile(configPath, "utf8"));
  } catch (error) {
    if (isMissingFile(error)) {
      return { config: defaults, exists: false };
    }
    throw error;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("페르소나 설정은 JSON 객체여야 합니다.");
  }
  if (parsed.version !== 1) {
    throw new Error("설정 version은 1이어야 합니다.");
  }
  if (
    typeof parsed.outputPath !== "string" ||
    parsed.outputPath.trim() === ""
  ) {
    throw new Error("설정 outputPath는 비어 있지 않은 문자열이어야 합니다.");
  }
  if (typeof parsed.workDir !== "string" || parsed.workDir.trim() === "") {
    throw new Error("설정 workDir은 비어 있지 않은 문자열이어야 합니다.");
  }
  if (parsed.since !== null && typeof parsed.since !== "string") {
    throw new Error("설정 since는 ISO 날짜 문자열 또는 null이어야 합니다.");
  }
  if (
    !parsed.sessionScan ||
    typeof parsed.sessionScan !== "object" ||
    Array.isArray(parsed.sessionScan) ||
    typeof parsed.sessionScan.enabled !== "boolean" ||
    !Array.isArray(parsed.sessionScan.roots) ||
    !parsed.sessionScan.roots.every((root) => typeof root === "string")
  ) {
    throw new Error("설정 sessionScan 형식이 올바르지 않습니다.");
  }

  const config = {
    version: 1,
    targets: normalizeTargets(parsed.targets),
    outputPath: expandHome(parsed.outputPath),
    workDir: expandHome(parsed.workDir),
    since: parsed.since,
    sessionScan: {
      enabled: parsed.sessionScan.enabled,
      roots: parsed.sessionScan.roots.map((root) => expandHome(root)),
    },
  };

  return { config, exists: true };
}
