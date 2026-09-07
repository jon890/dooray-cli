import { Command } from "commander";
import { getConfigOrThrow } from "../../config/store.js";
import { DoorayApiClient } from "../../api/client.js";
import type { MoveWikiPageRequest } from "../../api/types.js";
import { resolveWiki } from "../../resolvers/wiki.js";
import { resolveWikiPageInput } from "../../resolvers/wiki-page-input.js";
import { PROJECT_ID_RE } from "../../resolvers/project.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { DoorayCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
import type { OutputOptions } from "../../formatters/table.js";
import { printJson } from "../../formatters/table.js";

export interface MoveWikiPageOptions {
  id?: string;
  url?: string;
  project?: string;
  parent?: string;
  toWiki?: string;
  before?: string;
  first?: boolean;
  children?: boolean;
}

type ValidMoveWikiPageOptions = MoveWikiPageOptions & { parent: string };

export function validateMoveOptions(
  opts: MoveWikiPageOptions,
): asserts opts is ValidMoveWikiPageOptions {
  if (!opts.parent) {
    throw new DoorayCliError(
      "--parent 는 필수입니다. 이동 대상 부모 페이지 ID 를 지정하세요.",
      EXIT_PARAM_ERROR,
    );
  }
  if (opts.before && opts.first) {
    throw new DoorayCliError(
      "--before 와 --first 는 동시에 사용할 수 없습니다.",
      EXIT_PARAM_ERROR,
    );
  }
}

export function buildMoveBody(
  opts: ValidMoveWikiPageOptions,
  resolvedTargetWikiId?: string,
): MoveWikiPageRequest {
  const body: MoveWikiPageRequest = {
    targetParentPageId: opts.parent,
  };

  if (resolvedTargetWikiId) {
    body.targetWikiId = resolvedTargetWikiId;
  }
  if (opts.children === false) {
    body.withChildren = false;
  }
  if (opts.first) {
    body.beforePageId = "0";
  } else if (opts.before) {
    body.beforePageId = opts.before;
  }

  return body;
}

function emitMoveResult(
  globalOpts: OutputOptions,
  pageId: string,
  body: MoveWikiPageRequest,
): void {
  if (globalOpts.json) {
    printJson({ pageId, ...body, status: "moved" });
  } else if (globalOpts.quiet) {
    process.stdout.write(`${pageId}\n`);
  } else {
    process.stdout.write(
      `페이지(${pageId})가 부모 페이지(${body.targetParentPageId}) 아래로 이동되었습니다.\n`,
    );
    process.stdout.write(
      body.withChildren === false
        ? "하위 페이지는 함께 이동하지 않았습니다.\n"
        : "하위 페이지도 함께 이동했습니다.\n",
    );
    // beforePageId 가 없으면 정렬이 바뀌지 않았으므로 아무것도 알리지 않는다.
    // "0" 은 맨 앞을 뜻하는 공식 API 의 특수값이다.
    const orderMessage = describeOrderChange(body.beforePageId);
    if (orderMessage) process.stdout.write(orderMessage);
  }
}

export function describeOrderChange(beforePageId?: string): string | null {
  if (beforePageId == null) return null;
  if (beforePageId === "0") return "형제 중 맨 앞으로 정렬되었습니다.\n";
  return `형제 페이지(${beforePageId}) 바로 뒤로 정렬되었습니다.\n`;
}

export const wikiPageMoveCommand = new Command("move")
  .description("위키 페이지 이동 (부모 변경, 정렬 변경, 위키 간 이동)")
  .argument("[arg1]", "프로젝트 코드, Dooray Wiki URL, 또는 (`--id`/`--url` 모드일 때) 미사용")
  .argument("[arg2]", "page-id (positional 2개 모드)")
  .option("--id <pageId>", "위키 페이지 ID")
  .option("--url <url>", "Dooray Wiki URL")
  .option("--project <code>", "프로젝트 코드 (--id 모드에서 wikiId 해석 호출 절약)")
  .option("--parent <page-id>", "이동 대상 부모 페이지 ID (필수)")
  .option("--to-wiki <project|wikiId>", "이동 대상 위키 (프로젝트 코드 또는 위키 ID)")
  .option("--before <page-id>", "이 페이지 바로 뒤에 위치")
  .option("--first", "형제 중 맨 앞으로 이동")
  .option("--no-children", "하위 페이지를 함께 옮기지 않는다 (기본은 함께 이동)")
  .action(async (arg1, arg2, opts: MoveWikiPageOptions) => {
    validateMoveOptions(opts);

    const globalOpts = wikiPageMoveCommand.optsWithGlobals() as OutputOptions;
    const config = await getConfigOrThrow();
    const client = new DoorayApiClient(config.apiKey, config.baseUrl);

    const { wikiId, pageId } = await resolveWikiPageInput(client, {
      projectArg: arg1,
      pageIdArg: arg2,
      idOpt: opts.id,
      urlOpt: opts.url,
      project: opts.project,
    });

    const targetWikiId = opts.toWiki
      ? PROJECT_ID_RE.test(opts.toWiki)
        ? opts.toWiki
        : await resolveWiki(client, opts.toWiki)
      : undefined;
    const body = buildMoveBody(opts, targetWikiId);

    startSpinner("위키 페이지 이동 중...");
    try {
      await client.moveWikiPage(wikiId, pageId, body);
      stopSpinner(true, "위키 페이지 이동 완료");
      emitMoveResult(globalOpts, pageId, body);
    } catch (e) {
      stopSpinner(false);
      throw e;
    }
  });
