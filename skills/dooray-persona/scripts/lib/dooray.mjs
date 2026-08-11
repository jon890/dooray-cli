import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const EMPTY_PAGE_RETRY_DELAY_MS = 1_000;
const EMPTY_PAGE_MAX_RETRIES = 2;

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function configError(configPath) {
  return new Error(
    `Dooray API 설정을 읽을 수 없습니다: ${configPath}\n먼저 \`dooray setup\`을 실행하세요.`,
  );
}

export async function loadApiConfig(
  configPath = join(homedir(), ".dooray", "config.json"),
) {
  let raw;
  try {
    raw = await readFile(configPath, "utf8");
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      throw configError(configPath);
    }
    throw error;
  }

  const config = JSON.parse(raw);
  if (
    typeof config.apiKey !== "string" ||
    config.apiKey.trim() === "" ||
    typeof config.baseUrl !== "string" ||
    config.baseUrl.trim() === ""
  ) {
    throw configError(configPath);
  }

  return { apiKey: config.apiKey, baseUrl: config.baseUrl };
}

export function createRateLimiter(
  rps,
  { now = Date.now, sleep = defaultSleep } = {},
) {
  if (!Number.isInteger(rps) || rps <= 0) {
    throw new Error("rps는 1 이상의 정수여야 합니다.");
  }

  const callTimes = [];
  let virtualNow = Number.NEGATIVE_INFINITY;
  let queue = Promise.resolve();

  async function acquire() {
    let current = Math.max(now(), virtualNow);
    while (callTimes.length > 0 && callTimes[0] <= current - 1_000) {
      callTimes.shift();
    }

    if (callTimes.length >= rps) {
      const waitMs = callTimes[0] + 1_000 - current;
      await sleep(waitMs);
      virtualNow = current + waitMs;
      current = Math.max(now(), virtualNow);

      while (callTimes.length > 0 && callTimes[0] <= current - 1_000) {
        callTimes.shift();
      }
    }

    callTimes.push(current);
  }

  return function limit() {
    const scheduled = queue.then(acquire);
    queue = scheduled.catch(() => {});
    return scheduled;
  };
}

function addSearchParams(url, searchParams) {
  for (const [key, value] of Object.entries(searchParams ?? {})) {
    if (value == null) continue;
    url.searchParams.set(key, String(value));
  }
}

function responseExcerpt(body) {
  return body
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, 500);
}

export function createClient({ apiKey, baseUrl, rps = 4 }) {
  const limit = createRateLimiter(rps);
  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;

  return {
    async get(path, searchParams) {
      await limit();

      const url = new URL(String(path).replace(/^\/+/, ""), normalizedBaseUrl);
      addSearchParams(url, searchParams);

      const response = await fetch(url, {
        headers: { Authorization: `dooray-api ${apiKey}` },
      });
      const body = await response.text();

      if (!response.ok) {
        const excerpt = responseExcerpt(body);
        throw new Error(
          `Dooray API 요청 실패 (${response.status})${excerpt ? `: ${excerpt}` : ""}`,
        );
      }

      return JSON.parse(body);
    },
  };
}

async function getPage(client, path, searchParams, page, size) {
  for (let retry = 0; retry <= EMPTY_PAGE_MAX_RETRIES; retry += 1) {
    const response = await client.get(path, { ...searchParams, page, size });
    const result = Array.isArray(response?.result) ? response.result : [];
    const totalCount = Number(response?.totalCount ?? 0);

    if (totalCount <= 0 || result.length > 0) {
      return { result, totalCount };
    }

    if (retry === EMPTY_PAGE_MAX_RETRIES) {
      throw new Error(
        `Dooray API가 ${page}페이지에서 빈 결과를 반복했습니다. 속도 제한 가능성이 있습니다.`,
      );
    }

    await defaultSleep(EMPTY_PAGE_RETRY_DELAY_MS);
  }

  throw new Error("페이지 조회 재시도 상태가 올바르지 않습니다.");
}

async function collectPages(
  client,
  path,
  searchParams,
  { size, maxPages, stopBefore },
) {
  const collected = [];

  for (let page = 0; page < maxPages; page += 1) {
    const { result, totalCount } = await getPage(
      client,
      path,
      searchParams,
      page,
      size,
    );

    for (const item of result) {
      if (stopBefore?.(item)) return collected;
      collected.push(item);
    }

    if (collected.length >= totalCount) break;
  }

  return collected;
}

export function getAllPages(
  client,
  path,
  searchParams = {},
  { size = 100, maxPages = Infinity } = {},
) {
  return collectPages(client, path, searchParams, {
    size,
    maxPages,
    stopBefore: null,
  });
}

export async function getMe(client) {
  const response = await client.get("common/v1/members/me");
  return {
    organizationMemberId: response.result.id,
    name: response.result.name,
  };
}

export async function listProjects(client) {
  const projects = await getAllPages(client, "project/v1/projects", {
    member: "me",
  });
  return projects.map(({ id, code, name }) => ({ id, code, name }));
}

export function listPosts(
  client,
  projectId,
  { since = null, maxPages = Infinity } = {},
) {
  const sinceTimestamp = since == null ? null : Date.parse(since);

  return collectPages(
    client,
    `project/v1/projects/${projectId}/posts`,
    { order: "-createdAt" },
    {
      size: 100,
      maxPages,
      stopBefore:
        sinceTimestamp == null
          ? null
          : (post) => Date.parse(post.createdAt) < sinceTimestamp,
    },
  );
}

export async function getPost(client, projectId, postId) {
  const response = await client.get(
    `project/v1/projects/${projectId}/posts/${postId}`,
  );
  return response.result;
}

export function listComments(client, projectId, postId) {
  return getAllPages(
    client,
    `project/v1/projects/${projectId}/posts/${postId}/logs`,
  );
}

function containsMember(entries, memberId, includeGroups) {
  return entries.some(
    (entry) =>
      entry?.member?.organizationMemberId === memberId ||
      (includeGroups &&
        (entry?.group?.members ?? []).some(
          (member) => member?.organizationMemberId === memberId,
        )),
  );
}

export function classifyInvolvement(post, memberId) {
  const to = post?.users?.to ?? [];
  const ccEntries = post?.users?.cc ?? [];
  const assignedAsMember = containsMember(to, memberId, false);
  // 직접 배정이거나 소속 그룹이 담당으로 걸린 경우 모두 참이다.
  const assignedDirectOrViaGroup = containsMember(to, memberId, true);

  return {
    authored:
      post?.users?.from?.member?.organizationMemberId === memberId,
    assigned: assignedDirectOrViaGroup,
    cc: containsMember(ccEntries, memberId, true),
    assigneeKind:
      to.length === 0
        ? "none"
        : assignedAsMember
          ? "member"
          : assignedDirectOrViaGroup
            ? "group"
            : "none",
  };
}
