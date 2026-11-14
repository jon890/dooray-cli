/**
 * `post list` — 프로젝트의 업무 목록을 조회한다.
 *
 * 제목·태그·등록자·담당자·참조자·상위 업무·등록/수정 기간으로 거르고 정렬을 고를 수 있다.
 * 기간과 정렬은 서버에 보내기 전에 검증한다. 서버가 모르는 정렬 값을 오류 없이 무시하기 때문이다 (ADR-064).
 */

import { Command, Option } from "commander";
import { getConfigOrThrow } from "../../config/store.js";
import { createClient, type DoorayClient } from "../../api/dooray-client.js";
import { type GetPostsParams } from "../../api/client.js";
import { resolveProject } from "../../resolvers/project.js";
import { lookupTagIds } from "../../resolvers/tag.js";
import { ensureMembers, needsMemberList, resolveMember } from "../../resolvers/member.js";
import { ensureMe } from "../../resolvers/me.js";
import { resolvePost } from "../../resolvers/post.js";
import { resolvePostRef } from "../../resolvers/postRef.js";
import { wrapLookupError } from "../../resolvers/post-users.js";
import { resolveDateFilter } from "./date-filter.js";
import { parseParentRef, type ParentRef } from "./parent-ref.js";
import { formatPostList } from "../../formatters/post.js";
import type { OutputOptions } from "../../formatters/table.js";
import type { Post } from "../../api/types.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { DoorayCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";

/** 서버가 받는 정렬 값. 목록 밖의 값은 서버가 오류 없이 무시하고 기본 정렬로 돌려준다(실측). */
export const POST_LIST_ORDERS = [
  "-createdAt",
  "createdAt",
  "-postUpdatedAt",
  "postUpdatedAt",
  "-postDueAt",
  "postDueAt",
] as const;

// 기본값을 주지 않아 --help 에 "(default: [])" 가 붙지 않게 한다. 한 명만 받는 옵션에 빈 배열 기본값은 오해를 부른다.
const collect = (v: string, prev: string[] = []) => [...prev, v];

const MEMBER_FILTERS = [
  ["from", "fromMemberIds"],
  ["to", "toMemberIds"],
  ["cc", "ccMemberIds"],
] as const;

/** `me` 는 대소문자를 가리지 않는다. `Me` 가 이름 부분 일치로 넘어가 다른 사람이 걸리지 않게 한다. */
function isMe(input: string): boolean {
  return input.toLowerCase() === "me";
}

/**
 * `--from`·`--to`·`--cc` 값을 organizationMemberId 로 바꾼다.
 * `me` 는 API 키 주인이고, 그 밖의 값은 `resolveMember` 가 id·이메일·프로젝트 멤버 이름 순으로 푼다.
 * 호출자는 이름 입력이 있으면 멤버 목록 캐시를 먼저 데워 둔다. 그래야 병렬 해석이 목록을 한 번만 받는다.
 */
async function resolveFilterMember(
  client: DoorayClient,
  projectId: string,
  option: string,
  input: string,
  meId: () => Promise<string>,
): Promise<string> {
  try {
    if (isMe(input)) return await meId();
    return await resolveMember(client, projectId, input);
  } catch (err) {
    throw wrapLookupError(`--${option} 멤버 '${input}' 조회 실패`, err);
  }
}

/**
 * `--from`·`--to`·`--cc` 값을 한 명으로 확정한다. 주지 않았으면 `undefined`.
 *
 * 공식 문서는 이 파라미터에 id 하나만 적고 여러 id 의 결합 규칙을 적지 않는다. 그래서 옵션마다 한 명만 받는다.
 * 두 번 준 값을 조용히 마지막 값으로 쓰면 사용자는 둘 다 걸렸다고 오해하므로 거부한다.
 * 값은 trim 하고 빈 값을 거부한다. 빈 값을 빼고 넘어가면 필터 없이 전체 목록이 오고,
 * 공백만 있는 값은 이름 부분 일치로 엉뚱한 멤버가 걸린다 (ADR-064).
 */
function normalizeMemberInput(option: string, raw: string[]): string | undefined {
  if (raw.length > 1) {
    throw new DoorayCliError(
      `--${option} 는 한 명만 받습니다. 여러 명의 결합 규칙이 공식 문서에 없어 지원하지 않습니다`,
      EXIT_PARAM_ERROR,
    );
  }
  const [value] = raw;
  if (value == null) return undefined;
  const trimmed = value.trim();
  if (trimmed === "") {
    throw new DoorayCliError(
      `--${option} 값이 비어 있습니다: "${value}" (me, 멤버 id, 이메일, 프로젝트 멤버 이름 중 하나로 주세요)`,
      EXIT_PARAM_ERROR,
    );
  }
  return trimmed;
}

async function resolveParent(
  client: DoorayClient,
  projectId: string,
  parent: ParentRef,
): Promise<string> {
  switch (parent.kind) {
    case "postId":
      return parent.postId;
    case "number":
      return resolvePost(client, projectId, parent.number);
    case "ref":
      return resolvePostRef(client, parent.ref);
  }
}

export const postListCommand = new Command("list")
  .description("업무 목록 조회")
  .argument("<project>", "프로젝트 코드 또는 ID")
  .option("--subject <keyword>", "제목 키워드 필터링")
  .option("--all", "전체 페이지네이션 (모든 결과 조회)")
  .option("--page <number>", "페이지 번호", "0")
  .option("--size <number>", "페이지 크기", "20")
  .option(
    "--tag <name>",
    "태그로 필터링 (여러 번 주면 그 태그를 모두 가진 업무만)",
    (v, prev: string[]) => [...prev, v],
    [] as string[],
  )
  .option("--from <member>", "등록자로 필터링 (한 명, me·id·이메일·이름)", collect)
  .option("--to <member>", "담당자로 필터링 (한 명, me·id·이메일·이름)", collect)
  .option("--cc <member>", "참조자로 필터링 (한 명, me·id·이메일·이름)", collect)
  .option("--parent <ref>", "상위 업무의 하위 업무만 (이 프로젝트의 업무 번호, project/번호, postId)")
  .option("--created <range>", "등록 기간 (A~B, A~, ~B, prev-7d. A·B 는 YYYY-MM-DD 또는 ISO8601)")
  .option("--updated <range>", "수정 기간 (--created 와 같은 형식)")
  .addOption(
    new Option("--order <field>", "정렬")
      .choices(POST_LIST_ORDERS)
      .default("-createdAt"),
  )
  .action(async (project, opts) => {
    const globalOpts = postListCommand.optsWithGlobals() as OutputOptions;

    // 기간·상위 업무 형식과 멤버 값은 설정·프로젝트 조회보다 먼저 검증한다. 잘못된 값으로 API 를 한 번도 부르지 않게 한다.
    const createdAt = opts.created != null ? resolveDateFilter(opts.created, "created") : undefined;
    const updatedAt = opts.updated != null ? resolveDateFilter(opts.updated, "updated") : undefined;
    const parent = opts.parent != null ? parseParentRef(opts.parent) : undefined;
    // 멤버 필터는 주지 않았으면 키 자체를 넣지 않는다. 빈 배열을 넣으면 의도가 흐려진다.
    const memberInputs = MEMBER_FILTERS.flatMap(([option, key]) => {
      const input = normalizeMemberInput(option, (opts[option] ?? []) as string[]);
      return input == null ? [] : [{ option, key, input }];
    });

    const config = await getConfigOrThrow();
    const client = createClient(config);

    startSpinner("업무 목록 조회 중...");
    // 멤버·상위 업무·태그 해석도 실패할 수 있다. 어느 단계에서 끝나든 스피너를 내린다.
    let posts: Post[];
    try {
      const projectId = await resolveProject(client, project);

      const params: GetPostsParams = {
        order: opts.order,
      };
      if (opts.subject) params.subjects = opts.subject;
      if (createdAt) params.createdAt = createdAt;
      if (updatedAt) params.updatedAt = updatedAt;

      // 상위 업무·태그 필터도 주지 않았으면 키 자체를 넣지 않는다.
      const tagNames: string[] = (opts.tag ?? []).filter((s: string) => s.length > 0);

      // 이름 입력을 동시에 풀면 빈 캐시에서 이름마다 멤버 목록을 따로 받는다. 먼저 한 번 받아 둔다.
      if (memberInputs.some(({ input }) => !isMe(input) && needsMemberList(input))) {
        await ensureMembers(client, projectId);
      }
      let mePromise: Promise<string> | undefined;
      const meId = () => (mePromise ??= ensureMe(client).then((me) => me.id));

      // 서로 의존하지 않는 해석이라 함께 돌린다.
      await Promise.all([
        ...memberInputs.map(async ({ option, key, input }) => {
          params[key] = [await resolveFilterMember(client, projectId, option, input, meId)];
        }),
        parent &&
          resolveParent(client, projectId, parent).then((id) => {
            params.parentPostId = id;
          }),
        tagNames.length > 0 &&
          lookupTagIds(client, projectId, tagNames).then((ids) => {
            params.tagIds = ids;
          }),
      ]);

      if (opts.all) {
        posts = [];
        let page = 0;
        const size = 100;
        while (true) {
          const res = await client.getPosts(projectId, { ...params, page, size });
          posts.push(...res.result);
          if (posts.length >= res.totalCount) break;
          page++;
        }
      } else {
        const res = await client.getPosts(projectId, {
          ...params,
          page: Number(opts.page),
          size: Number(opts.size),
        });
        posts = res.result;
      }
    } catch (err) {
      stopSpinner(false);
      throw err;
    }

    stopSpinner(true, "업무 목록 조회 완료");
    formatPostList(posts, globalOpts);
  });
