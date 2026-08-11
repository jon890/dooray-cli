import { access, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { parseArgs, loadPersonaConfig } from "./lib/config.mjs";
import {
  classifyInvolvement,
  createClient,
  getMe,
  getPost,
  listComments,
  listPosts,
  loadApiConfig,
} from "./lib/dooray.mjs";

function sanitizeForTerminal(value) {
  return String(value).replace(/[\u0000-\u001f\u007f]/g, "?");
}

function hasRefreshFlag(flags) {
  for (const flag of flags) {
    if (flag !== "--refresh") {
      throw new Error(`알 수 없는 옵션입니다: ${flag}`);
    }
  }
  return flags.includes("--refresh");
}

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return false;
    }
    throw error;
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

function involvementFields(involvement) {
  return {
    involvement: {
      authored: involvement.authored,
      assigned: involvement.assigned,
      cc: involvement.cc,
    },
    assigneeKind: involvement.assigneeKind,
  };
}

function bodyEntry(target, post, detail, involvement) {
  return {
    id: `${post.id}#body`,
    kind: "body",
    projectId: target.projectId,
    projectCode: target.code,
    postId: post.id,
    postNumber: post.number,
    subject: post.subject,
    createdAt: detail.createdAt,
    mimeType: detail.body.mimeType,
    text: detail.body.content,
    ...involvementFields(involvement),
  };
}

function commentEntry(target, post, comment, involvement) {
  return {
    id: `${post.id}#log-${comment.id}`,
    kind: "comment",
    projectId: target.projectId,
    projectCode: target.code,
    postId: post.id,
    postNumber: post.number,
    subject: post.subject,
    createdAt: comment.createdAt,
    mimeType: comment.body.mimeType,
    text: comment.body.content,
    ...involvementFields(involvement),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const refresh = hasRefreshFlag(args.flags);
  const { config } = await loadPersonaConfig(args.configPath);

  if (config.targets.length === 0) {
    process.stderr.write(
      "수집 대상이 없습니다. discover-targets.mjs를 먼저 실행해 대상을 선택하세요.\n",
    );
    process.exitCode = 1;
    return;
  }

  const outDir = args.outDir ?? config.workDir;
  const corpusPath = join(outDir, "corpus.jsonl");
  if (!refresh && (await fileExists(corpusPath))) {
    process.stderr.write(
      "기존 corpus.jsonl을 유지합니다. 다시 수집하려면 --refresh를 사용하세요.\n",
    );
    return;
  }

  const apiConfig = await loadApiConfig();
  const client = createClient(apiConfig);
  const me = await getMe(client);
  const entries = [];

  for (let targetIndex = 0; targetIndex < config.targets.length; targetIndex += 1) {
    const target = config.targets[targetIndex];
    process.stderr.write(
      `프로젝트 수집 중: ${targetIndex + 1}/${config.targets.length}\n`,
    );
    const posts = await listPosts(client, target.projectId, {
      since: config.since,
    });
    const candidates = posts
      .map((post) => ({
        post,
        involvement: classifyInvolvement(post, me.organizationMemberId),
      }))
      .filter(
        ({ involvement }) =>
          involvement.authored || involvement.assigned || involvement.cc,
      );

    for (let index = 0; index < candidates.length; index += 1) {
      const { post, involvement } = candidates[index];
      if (involvement.authored) {
        const detail = await getPost(client, target.projectId, post.id);
        entries.push(bodyEntry(target, post, detail, involvement));
      }

      const comments = await listComments(client, target.projectId, post.id);
      for (const comment of comments) {
        if (
          comment?.creator?.member?.organizationMemberId ===
          me.organizationMemberId
        ) {
          entries.push(commentEntry(target, post, comment, involvement));
        }
      }

      if ((index + 1) % 25 === 0 || index + 1 === candidates.length) {
        process.stderr.write(
          `관련 업무 처리 중: ${index + 1}/${candidates.length}\n`,
        );
      }
    }
  }

  const serialized =
    entries.map((entry) => JSON.stringify(entry)).join("\n") +
    (entries.length > 0 ? "\n" : "");
  await mkdir(outDir, { recursive: true, mode: 0o700 });
  await writePrivateFile(corpusPath, serialized);
  process.stdout.write(
    `${JSON.stringify({ outputPath: corpusPath, entries: entries.length })}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(
    `수집 실패: ${sanitizeForTerminal(error?.message ?? error)}\n`,
  );
  process.exitCode = 1;
});
