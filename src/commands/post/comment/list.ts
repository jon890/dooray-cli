import { Command } from "commander";
import { getConfigOrThrow } from "../../../config/store.js";
import { DoorayApiClient } from "../../../api/client.js";
import { resolvePostInput } from "../../../resolvers/post-input.js";
import { buildMemberNameMap, resolveMember } from "../../../resolvers/member.js";
import { enrichCommentCreators } from "../../../utils/comment-enrich.js";
import { formatCommentList } from "../../../formatters/post.js";
import type { OutputOptions } from "../../../formatters/table.js";
import { startSpinner, stopSpinner } from "../../../utils/spinner.js";
import { DoorayCliError } from "../../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../../utils/exit-codes.js";
import type { PostComment } from "../../../api/types.js";

// LOW-2: Commander .option() default와 동기화 보장
const PAGE_DEFAULT = "0";
const SIZE_DEFAULT = "20";

// LOW-1: --since 날짜 파싱 헬퍼 (action 진입 전 검증 + fetchSince 공유)
function parseSinceDate(input: string): Date {
  const d = new Date(input);
  if (isNaN(d.getTime())) {
    throw new DoorayCliError(
      `--since 값을 파싱할 수 없습니다: "${input}" (ISO 8601 또는 YYYY-MM-DD)`,
      EXIT_PARAM_ERROR,
    );
  }
  return d;
}

function validateExclusive(opts: Record<string, unknown>): void {
  function err(msg: string): DoorayCliError {
    return new DoorayCliError(msg, EXIT_PARAM_ERROR);
  }
  // --latest 상호배타
  if (opts.latest) {
    if (opts.page && opts.page !== PAGE_DEFAULT) throw err("--latest와 --page는 동시 사용 불가");
    if (opts.size && opts.size !== SIZE_DEFAULT) throw err("--latest와 --size는 동시 사용 불가");
    if (opts.sort && opts.sort !== "asc") throw err("--latest와 --sort는 동시 사용 불가");
    if (opts.reverse) throw err("--latest와 --reverse는 동시 사용 불가");
    if (opts.since) throw err("--latest와 --since는 동시 사용 불가");
  }
  // MEDIUM-2: --sort 기본값 "asc"이므로, --reverse + 명시 --sort asc는 무해(둘 다 결과 동일)로 보고 통과.
  // 진짜 모순(--reverse + --sort desc)만 차단.
  if (opts.reverse && opts.sort && opts.sort !== "asc") {
    throw err("--reverse와 --sort 옵션은 동시 사용 불가");
  }
  // --sort 값 검증
  if (opts.sort && opts.sort !== "asc" && opts.sort !== "desc") {
    throw err(`--sort는 asc 또는 desc만 허용합니다: "${opts.sort}"`);
  }
}

function resolveOrder(opts: Record<string, unknown>): "createdAt" | "-createdAt" {
  if (opts.reverse) return "-createdAt";
  if (opts.sort === "desc") return "-createdAt";
  return "createdAt";
}

async function fetchSince(
  client: DoorayApiClient,
  projectId: string,
  postId: string,
  sinceDate: Date,
): Promise<PostComment[]> {
  const sinceMs = sinceDate.getTime();
  const collected: PostComment[] = [];
  let page = 0;
  const size = 100;
  while (true) {
    const res = await client.getPostComments(projectId, postId, {
      page, size, order: "-createdAt",
    });
    const pageItems = res.result;
    const survivors = pageItems.filter((c) => new Date(c.createdAt).getTime() >= sinceMs);
    collected.push(...survivors);
    const hasOlder = pageItems.length > survivors.length;
    if (hasOlder) break;
    if (pageItems.length < size) break;
    page++;
  }
  return collected;
}

export const commentListCommand = new Command("list")
  .description("댓글 목록 조회")
  .argument("[project]", "프로젝트 코드 (또는 첫 인자에 Dooray URL)")
  .argument("[post-number]", "업무 번호 (project와 함께 사용)")
  .option("--id <postId>", "Dooray post ID (project/post-number 대신)")
  .option("--url <url>", "Dooray 업무 URL (project/post-number 대신)")
  .option("--page <number>", "페이지 번호", PAGE_DEFAULT)
  .option("--size <number>", "페이지 크기", SIZE_DEFAULT)
  .option("--sort <order>", "정렬 (asc/desc), 기본 asc", "asc")
  .option("--reverse", "--sort desc 의 alias")
  .option("--latest <n>", "최신 N개 (--sort desc + size=N + page=0 단축, 최대 100)")
  .option("--since <iso>", "이 시간 이후 댓글만 (ISO 8601 또는 YYYY-MM-DD)")
  .option("--from-author <name>", "작성자 이름으로 필터 (부분일치)")
  .action(async (project, postNumberStr, opts) => {
    const globalOpts = commentListCommand.optsWithGlobals() as OutputOptions;
    const config = await getConfigOrThrow();
    const client = new DoorayApiClient(config.apiKey, config.baseUrl);

    // 상호배타 검증 (fetch 전)
    validateExclusive(opts);

    // MEDIUM-1: --latest 상한 검증 (fetch 전)
    if (opts.latest) {
      const n = Number(opts.latest);
      if (!Number.isFinite(n) || n <= 0) {
        throw new DoorayCliError("--latest는 양의 정수여야 합니다.", EXIT_PARAM_ERROR);
      }
      if (n > 100) {
        throw new DoorayCliError("--latest는 최대 100까지 지원합니다.", EXIT_PARAM_ERROR);
      }
    }

    // LOW-1: --since 날짜 파싱 (fetch 전 — parseSinceDate 공유)
    const sinceDate = opts.since ? parseSinceDate(opts.since as string) : null;

    startSpinner("댓글 목록 조회 중...");
    const { projectId, postId } = await resolvePostInput(client, {
      projectArg: project,
      postNumberArg: postNumberStr,
      idOpt: opts.id,
      urlOpt: opts.url,
    });

    const order = resolveOrder(opts);

    let comments: PostComment[];
    if (opts.latest) {
      const n = Number(opts.latest);
      const res = await client.getPostComments(projectId, postId, {
        page: 0, size: n, order: "-createdAt",
      });
      comments = res.result;
    } else if (sinceDate) {
      comments = await fetchSince(client, projectId, postId, sinceDate);
      if (order === "createdAt") comments = [...comments].reverse();
    } else {
      const res = await client.getPostComments(projectId, postId, {
        page: Number(opts.page),
        size: Number(opts.size),
        order,
      });
      comments = res.result;
    }

    stopSpinner(true, "댓글 목록 조회 완료");

    if (opts.fromAuthor) {
      const memberId = await resolveMember(client, projectId, opts.fromAuthor as string);
      comments = comments.filter(
        (c) => c.creator?.member?.organizationMemberId === memberId,
      );
    }

    if (!globalOpts.json) {
      // table/quiet 출력일 때만 enrich (--json은 raw 유지 — ADR-021)
      let nameMap = new Map<string, string>();
      try {
        nameMap = await buildMemberNameMap(client, projectId);
      } catch { /* enrich 실패 시 빈 map → 표시명 비어있음, 명령은 정상 동작 */ }
      comments = enrichCommentCreators(comments, nameMap);
    }
    formatCommentList(comments, globalOpts);
  });
