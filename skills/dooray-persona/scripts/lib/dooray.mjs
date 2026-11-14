import { execFile } from "node:child_process";

/**
 * Dooray 호출은 모두 `dooray ... --json` CLI 실행으로 한다.
 * 인증 방식(api-key·web)과 쿠키·키 읽기, 호출 간격은 CLI 가 같은 설정으로 맡는다.
 * `--json` 은 인증 방식과 무관하게 공개 API 응답 모양이다.
 */

const PAGE_SIZE = 100;
const MAX_BUFFER = 256 * 1024 * 1024;

export class DoorayCliMissingError extends Error {}

function cliMissing() {
  return new DoorayCliMissingError(
    "dooray CLI 를 찾을 수 없습니다. `npm install -g @bifos/dooray-cli` 로 설치한 뒤 `dooray setup` 을 실행하세요.",
  );
}

/** 한 줄 요약: stderr 마지막 줄이나 종료 코드. 제어 문자는 뗀다. */
function failureMessage(args, error, stderr) {
  const lastLine = String(stderr ?? "")
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, " ")
    .trim()
    .split("\n")
    .filter(Boolean)
    .at(-1);
  const command = args.slice(0, args[0] === "post" && args[1] === "comment" ? 3 : 2).join(" ");
  return `dooray ${command} 실패 (종료 코드 ${error.code ?? "?"})${lastLine ? `: ${lastLine}` : ""}`;
}

/**
 * dooray CLI 를 셸 없이 실행하고 `--json` 출력을 파싱한다. 실행기는 테스트가 바꿔 끼운다.
 * 종료 코드가 0 이 아니면 CLI 의 안내(stderr)를 그대로 담아 던진다.
 */
export function runDooray(args, { exec = execFile, bin = "dooray" } = {}) {
  return new Promise((resolve, reject) => {
    exec(bin, [...args, "--json"], { maxBuffer: MAX_BUFFER }, (error, stdout, stderr) => {
      if (error) {
        reject(error.code === "ENOENT" ? cliMissing() : new Error(failureMessage(args, error, stderr)));
        return;
      }
      try {
        resolve(JSON.parse(String(stdout)));
      } catch {
        reject(new Error(`dooray ${args.slice(0, 2).join(" ")} 의 --json 출력을 읽을 수 없습니다.`));
      }
    });
  });
}

/** 페이지 번호를 0 부터 올리며 PAGE_SIZE 보다 적게 오거나 maxPages 에 닿거나 stop 이 참이 될 때까지 모은다. */
async function collectPages(fetchPage, { maxPages = Infinity, stopBefore = null } = {}) {
  const collected = [];
  for (let page = 0; page < maxPages; page += 1) {
    const items = await fetchPage(page);
    if (!Array.isArray(items)) throw new Error("dooray CLI 의 목록 출력이 배열이 아닙니다.");
    for (const item of items) {
      if (stopBefore?.(item)) return collected;
      collected.push(item);
    }
    if (items.length < PAGE_SIZE) break;
  }
  return collected;
}

export async function getMe(options) {
  const me = await runDooray(["member", "get", "me"], options);
  return { organizationMemberId: me.id, name: me.name };
}

export async function listProjects(options) {
  const projects = await runDooray(["project", "list"], options);
  return projects.map(({ id, code, name }) => ({ id, code, name }));
}

export function listPosts(projectId, { since = null, maxPages = Infinity, ...options } = {}) {
  const sinceTimestamp = since == null ? null : Date.parse(since);
  return collectPages(
    (page) =>
      runDooray(
        [
          "post", "list", projectId,
          "--page", String(page), "--size", String(PAGE_SIZE), "--order", "-createdAt",
          ...(since == null ? [] : ["--created", `${since}~`]),
        ],
        options,
      ),
    {
      maxPages,
      stopBefore:
        sinceTimestamp == null
          ? null
          : (post) => Date.parse(post.createdAt) < sinceTimestamp,
    },
  );
}

export function getPost(postId, options) {
  return runDooray(["post", "get", "--id", postId], options);
}

export function listComments(postId, options) {
  return collectPages(
    (page) =>
      runDooray(
        ["post", "comment", "list", "--id", postId, "--page", String(page), "--size", String(PAGE_SIZE)],
        options,
      ),
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
