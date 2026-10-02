/**
 * `wiki page replace` — 위키 페이지 본문에서 문자열 하나를 찾아 바꾼다.
 *
 * 현재 본문을 GET 해 치환한 뒤 `PUT .../content` 로 본문만 보낸다. 제목은 건드리지 않고
 * 본문 형식은 기존 값을 보존한다. 치환으로 첨부·인라인 이미지 참조가 사라지면 `post replace` 와 같게 확인을 받는다. 별도 명령으로 둔 이유와 왕복의 한계는 ADR-065 가 소유한다.
 */
import { Command } from "commander";
import { getConfigOrThrow } from "../../config/store.js";
import { DoorayApiClient } from "../../api/client.js";
import {
  resolveWikiPageInput,
  WIKI_PAGE_ID_OPTION_DESC,
  WIKI_PAGE_PROJECT_OPTION_DESC,
} from "../../resolvers/wiki-page-input.js";
import type { OutputOptions } from "../../formatters/table.js";
import { printJson } from "../../formatters/table.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { resolveBodyMimeType } from "../../utils/body-input.js";
import { applyReplace, readReplaceInputs } from "../../utils/body-replace.js";
import { checkAndGuardDropped } from "../../utils/attachment-check.js";
import { printReplacePreview } from "../../formatters/body-replace.js";
import type { WikiPageDetail } from "../../api/types.js";

/**
 * 첨부 누락 검사에 넘길 목록. 인라인 이미지는 본문 참조의 id 가 `attachFileId` 였어서 그 값도 함께 넣는다.
 * `attachFileId` 는 공식 문서 응답에 없는 필드라(실측으로만 확인) 없으면 `id` 만으로 확인한다.
 * 일반 첨부의 본문 참조 형태는 실측하지 못해 `id` 와 `attachFileId` 를 모두 후보로 둔다 (ADR-065).
 */
function wikiAttachments(page: WikiPageDetail): { id: string; name: string }[] {
  const out: { id: string; name: string }[] = [];
  for (const f of [...(page.files ?? []), ...(page.images ?? [])]) {
    out.push({ id: f.id, name: f.name });
    if (f.attachFileId && f.attachFileId !== f.id) out.push({ id: f.attachFileId, name: f.name });
  }
  return out;
}

export const wikiPageReplaceCommand = new Command("replace")
  .description("위키 페이지 본문의 일부만 치환 (긴 본문에서 한두 군데를 고칠 때 edit 대신 사용)")
  .argument("[arg1]", "프로젝트 코드, Dooray Wiki URL, 또는 (`--id`/`--url` 모드일 때) 미사용")
  .argument("[arg2]", "page-id (positional 2개 모드)")
  .option("--id <pageId>", WIKI_PAGE_ID_OPTION_DESC)
  .option("--url <url>", "Dooray Wiki URL")
  .option("--project <code>", WIKI_PAGE_PROJECT_OPTION_DESC)
  .option("--old <text>", "찾을 문자열 (공백·줄바꿈까지 정확히 일치, - 입력 시 stdin)")
  .option("--old-file <path>", "찾을 문자열 파일 경로 (- 입력 시 stdin)")
  .option("--new <text>", "바꿀 문자열 (빈 문자열이면 old 구간 삭제, - 입력 시 stdin)")
  .option("--new-file <path>", "바꿀 문자열 파일 경로 (- 입력 시 stdin)")
  .option("--all", "일치하는 곳을 모두 치환 (없으면 정확히 한 군데일 때만 치환)")
  .option("--dry-run", "API 수정 없이 바뀌는 줄만 출력")
  .option("--no-confirm", "누락 attachment 경고 시 confirm 없이 진행 (자동화용)")
  .action(async (arg1, arg2, opts) => {
    const { oldText, newText } = await readReplaceInputs(opts);

    const config = await getConfigOrThrow();
    const client = new DoorayApiClient(config.apiKey, config.baseUrl);
    const globalOpts = wikiPageReplaceCommand.optsWithGlobals() as OutputOptions;

    const { wikiId, pageId } = await resolveWikiPageInput(client, {
      projectArg: arg1,
      pageIdArg: arg2,
      idOpt: opts.id,
      urlOpt: opts.url,
      project: opts.project,
    });

    startSpinner("위키 페이지 조회 중...");
    let page: WikiPageDetail;
    try {
      page = (await client.getWikiPage(wikiId, pageId)).result;
      stopSpinner(true, "위키 페이지 조회 완료");
    } catch (e) {
      stopSpinner(false);
      throw e;
    }

    const current = page.body?.content ?? "";
    const result = applyReplace(current, oldText, newText, !!opts.all);
    const bodyMimeType = resolveBodyMimeType(page.body?.mimeType);

    if (opts.dryRun) {
      printReplacePreview(globalOpts, { pageId }, result, bodyMimeType);
      return;
    }

    await checkAndGuardDropped(current, result.content, wikiAttachments(page), !opts.confirm);

    // 첨부 누락 확인 프롬프트는 스피너가 없는 동안 끝난다. 수정 스피너는 그 뒤에 띄운다.
    startSpinner("위키 페이지 본문 수정 중...");
    try {
      await client.updateWikiPageContent(wikiId, pageId, {
        body: { mimeType: bodyMimeType, content: result.content },
      });
      stopSpinner(true, "위키 페이지 수정 완료");
    } catch (e) {
      stopSpinner(false);
      throw e;
    }

    if (globalOpts.json) {
      printJson({ wikiId, pageId, replaced: result.replaced });
    } else if (globalOpts.quiet) {
      process.stdout.write(`${pageId}\n`);
    } else {
      process.stdout.write(`위키 페이지 본문에서 ${result.replaced}군데를 치환했습니다: ${pageId}\n`);
    }
  });
