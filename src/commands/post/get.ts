import { Command } from "commander";
import chalk from "chalk";
import { getConfigOrThrow } from "../../config/store.js";
import { createClient, type DoorayClient } from "../../api/dooray-client.js";
import { resolvePostInput } from "../../resolvers/post-input.js";
import { attachTagNames } from "../../resolvers/tag.js";
import { formatPostDetail, type PostDetailTag } from "../../formatters/post.js";
import type { OutputOptions } from "../../formatters/table.js";
import { DoorayCliError } from "../../utils/errors.js";
import { EXIT_API_ERROR } from "../../utils/exit-codes.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";

export const postGetCommand = new Command("get")
  .description("업무 상세 조회")
  .argument("[project]", "프로젝트 코드 (또는 첫 인자에 Dooray URL)")
  .argument("[post-number]", "업무 번호 (project와 함께 사용)")
  .option("--id <postId>", "Dooray post ID (project/post-number 대신)")
  .option("--url <url>", "Dooray 업무 URL (project/post-number 대신)")
  .option("--with-tag-names", "태그에 이름을 채운다 (--json 출력에 name 필드 추가)")
  .action(async (project, postNumberStr, opts) => {
    const globalOpts = postGetCommand.optsWithGlobals() as OutputOptions;
    const config = await getConfigOrThrow();
    const client = createClient(config);

    startSpinner("업무 조회 중...");
    const { projectId, postId } = await resolvePostInput(client, {
      projectArg: project,
      postNumberArg: postNumberStr,
      idOpt: opts.id,
      urlOpt: opts.url,
      argv: process.argv.slice(2),
    });
    const res = await client.getPost(projectId, postId);
    const post = res.result;

    const withTagNames = Boolean(opts.withTagNames);
    const json = Boolean(globalOpts.json);

    const { tags, warning } = await resolveTagNames(client, projectId, post.tags ?? [], {
      json,
      withTagNames,
    });

    stopSpinner(true, "업무 조회 완료");

    // spinner 가 도는 동안 stderr 에 쓰면 애니메이션 프레임과 섞인다.
    // 경고는 여기까지 들고 왔다가 spinner 를 내린 뒤에 낸다.
    if (warning) process.stderr.write(chalk.yellow(`경고: ${warning}\n`));

    // 일반 출력은 옵션과 무관하게 이름을 붙이므로 이 옵션은 효력이 없다.
    // CLAUDE.md 의 「무시되는 옵션」 규약대로 경고만 내고 그대로 진행한다.
    if (withTagNames && !json) {
      process.stderr.write(
        chalk.yellow("경고: --with-tag-names 는 --json 과 함께 줄 때만 효력이 있습니다.\n"),
      );
    }

    formatPostDetail(post, globalOpts, tags);
  });

/**
 * 출력에 쓸 태그 목록을 정한다.
 *
 * 이름을 붙이지 않는 경우에는 `undefined` 를 돌려주고 포맷터가 응답을 그대로 내게 한다 (ADR-056).
 */
async function resolveTagNames(
  client: DoorayClient,
  projectId: string,
  tags: ReadonlyArray<{ id: string; name?: string }>,
  mode: { json: boolean; withTagNames: boolean },
): Promise<{ tags: PostDetailTag[] | undefined; warning?: string }> {
  if (tags.length === 0) return { tags: undefined };
  // `--json` 만 준 호출은 응답을 그대로 내므로 결과를 쓸 곳이 없다.
  // 그런데도 부르면 캐시가 비었을 때 태그 목록 전체 순회가 통째로 붙는다.
  if (mode.json && !mode.withTagNames) return { tags: undefined };

  // 이름을 못 구했을 때 실패로 끝낼지는 `--json` 과 함께 준 경우에만 정해진다.
  // `--json` 이 없으면 그 이름을 쓸 곳이 없으므로, 효력이 없다고 경고해 놓고
  // 상세 조회를 통째로 버리는 것은 「무시되는 옵션」 규약과 어긋난다.
  const strict = mode.withTagNames && mode.json;

  let result;
  try {
    result = await attachTagNames(client, projectId, tags);
  } catch (e) {
    if (strict) throw e;
    // 사람이 읽는 출력이라 태그 줄 하나 때문에 상세 조회를 버리지 않는다.
    const msg = e instanceof Error ? e.message : String(e);
    return {
      tags: tags.map((tag) => ({ ...tag })),
      warning: `태그 이름을 불러오지 못했습니다: ${msg}`,
    };
  }

  if (strict && result.missing.length > 0) {
    throw new DoorayCliError(
      `태그 이름을 찾지 못했습니다: ${result.missing.join(", ")}\n` +
        `  태그 캐시가 오래됐을 수 있습니다: dooray cache clear`,
      EXIT_API_ERROR,
    );
  }

  return { tags: result.tags };
}
