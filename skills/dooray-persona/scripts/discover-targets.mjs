import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { parseArgs, loadPersonaConfig } from "./lib/config.mjs";
import {
  classifyInvolvement,
  createClient,
  getMe,
  listPosts,
  listProjects,
  loadApiConfig,
} from "./lib/dooray.mjs";

function sanitizeForTerminal(value) {
  return String(value).replace(/[\u0000-\u001f\u007f]/g, "?");
}

function parseMaxPages(flags) {
  let maxPages = Infinity;

  for (let index = 0; index < flags.length; index += 1) {
    const flag = flags[index];
    if (flag !== "--max-pages") {
      throw new Error(`알 수 없는 옵션입니다: ${flag}`);
    }

    const value = Number(flags[index + 1]);
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error("--max-pages에는 1 이상의 정수를 입력하세요.");
    }
    maxPages = value;
    index += 1;
  }

  return maxPages;
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
  const maxPages = parseMaxPages(args.flags);
  const { config } = await loadPersonaConfig(args.configPath);
  const outDir = args.outDir ?? config.workDir;
  const apiConfig = await loadApiConfig();
  const client = createClient(apiConfig);
  const me = await getMe(client);
  const projects = await listProjects(client);
  const candidates = [];

  if (Number.isFinite(maxPages)) {
    process.stderr.write(
      `업무 목록을 프로젝트별 최대 ${maxPages}페이지로 제한합니다. 집계가 전체 결과가 아닐 수 있습니다.\n`,
    );
  }

  for (let index = 0; index < projects.length; index += 1) {
    const project = projects[index];
    process.stderr.write(
      `프로젝트 업무 수집 중: ${index + 1}/${projects.length}\n`,
    );
    const posts = await listPosts(client, project.id, { maxPages });
    const summary = {
      projectId: project.id,
      code: project.code,
      name: project.name ?? project.code,
      total: posts.length,
      authored: 0,
      assignedAsMember: 0,
      assignedViaGroup: 0,
      cc: 0,
      related: 0,
    };

    for (const post of posts) {
      const involvement = classifyInvolvement(
        post,
        me.organizationMemberId,
      );
      if (involvement.authored) summary.authored += 1;
      if (involvement.assigneeKind === "member") {
        summary.assignedAsMember += 1;
      }
      if (involvement.assigneeKind === "group") {
        summary.assignedViaGroup += 1;
      }
      if (involvement.cc) summary.cc += 1;
      if (involvement.authored || involvement.assigned || involvement.cc) {
        summary.related += 1;
      }
    }

    candidates.push(summary);
  }

  candidates.sort(
    (left, right) =>
      right.related - left.related || left.code.localeCompare(right.code),
  );
  const output = {
    generatedAt: new Date().toISOString(),
    projects: candidates,
  };
  const serialized = `${JSON.stringify(output, null, 2)}\n`;

  await mkdir(outDir, { recursive: true, mode: 0o700 });
  await writePrivateFile(join(outDir, "candidates.json"), serialized);
  process.stdout.write(serialized);
}

main().catch((error) => {
  process.stderr.write(
    `대상 탐색 실패: ${sanitizeForTerminal(error?.message ?? error)}\n`,
  );
  process.exitCode = 1;
});
