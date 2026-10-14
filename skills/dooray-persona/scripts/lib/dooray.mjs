import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { homedir, userInfo } from "node:os";
import { join, resolve } from "node:path";

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

/**
 * dooray CLI 와 같은 규칙으로 키체인 account 를 정한다.
 * config 경로가 계정 홈의 `~/.dooray/config.json` 이면 `apiKey`, 아니면 `apiKey:<경로 sha256 앞 16자>` 다.
 */
export function keychainApiKeyAccount(configPath) {
  const resolved = resolve(configPath);
  const defaultPath = resolve(join(userInfo().homedir, ".dooray", "config.json"));
  if (resolved === defaultPath) return "apiKey";
  const hash = createHash("sha256").update(resolved).digest("hex").slice(0, 16);
  return `apiKey:${hash}`;
}

/**
 * macOS 에서 dooray CLI 는 API 토큰을 config.json 이 아니라 로그인 키체인에 둔다.
 * 읽기는 argv 에 비밀값이 없어 execFile 로 불러도 된다. 항목이 없으면 undefined 다.
 */
export function readKeychainApiKey(account = "apiKey") {
  return new Promise((resolvePromise, reject) => {
    execFile(
      "/usr/bin/security",
      ["find-generic-password", "-s", "dooray-cli", "-a", account, "-w"],
      // security 는 로그인 키체인을 $HOME 에서 찾는다. HOME 이 바뀌어 있어도 계정의 실제 홈을 쓴다.
      { env: { ...process.env, HOME: userInfo().homedir } },
      (error, stdout, stderr) => {
        if (error) {
          if (error.code === 44) {
            resolvePromise(undefined);
            return;
          }
          reject(
            new Error(
              `macOS 키체인에서 Dooray API 토큰을 읽지 못했습니다: ${String(stderr).trim() || error.message}\n` +
                "로그인 키체인이 잠겨 있거나 접근이 거부됐을 수 있습니다.",
            ),
          );
          return;
        }
        // 끝 개행 하나만 뗀다. 값 앞뒤의 공백은 값의 일부다.
        const value = String(stdout);
        resolvePromise(value.endsWith("\n") ? value.slice(0, -1) : value);
      },
    );
  });
}

export async function loadApiConfig(
  configPath = join(homedir(), ".dooray", "config.json"),
  { platform = process.platform, readKeychain = readKeychainApiKey } = {},
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
  // macOS 에서 키체인으로 옮겨진 뒤에는 파일에 apiKey 가 없다. 그때만 키체인을 본다.
  // CLI 와 같이 빈 문자열만 「없음」 이다. 공백뿐인 값은 아래 검사에서 실패한다.
  const fileApiKeyMissing =
    typeof config.apiKey !== "string" || config.apiKey === "";
  if (fileApiKeyMissing && platform === "darwin") {
    const keychainApiKey = await readKeychain(keychainApiKeyAccount(configPath));
    if (keychainApiKey !== undefined) config.apiKey = keychainApiKey;
  }
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
