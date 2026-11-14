import { Command, Option } from "commander";
import { getConfigOrThrow } from "../../config/store.js";
import { createClient } from "../../api/dooray-client.js";
import { resolveWikiPageInput } from "../../resolvers/wiki-page-input.js";
import {
  openInEditor,
  serializeWikiFrontmatter,
  parseWikiFrontmatter,
} from "../../editor/index.js";
import { readBodyInput, BODY_MIME_TYPES, resolveBodyMimeType, warnUnconvertedBody } from "../../utils/body-input.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { DoorayCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";

export const wikiPageEditCommand = new Command("edit")
  .description("위키 페이지 수정 (플래그 없으면 $EDITOR)")
  .argument("[arg1]", "프로젝트 코드, Dooray Wiki URL, 또는 (`--id`/`--url` 모드일 때) 미사용")
  .argument("[arg2]", "page-id (positional 2개 모드)")
  .option("--id <pageId>", "위키 페이지 ID")
  .option("--url <url>", "Dooray Wiki URL")
  .option("--project <code>", "프로젝트 코드 (--id 모드에서 wikiId 해석용)")
  .option("--title <title>", "페이지 제목 (지정 시 $EDITOR 생략)")
  .option("--body <text>", "본문 텍스트 (- 입력 시 stdin에서 읽기)")
  .option("--body-file <path>", "본문 파일 경로 (- 입력 시 stdin에서 읽기)")
  .addOption(
    new Option("--mime-type <type>", "본문 형식 (미지정 시 기존 페이지의 형식 유지, 단독 지정 시 본문은 그대로 두고 형식만 변경)")
      .choices(BODY_MIME_TYPES),
  )
  .action(async (arg1, arg2, opts) => {
    const config = await getConfigOrThrow();
    const client = createClient(config);

    const hasTitle = opts.title != null;
    const hasBody = opts.body != null || opts.bodyFile != null;
    const hasMimeType = opts.mimeType != null;
    const nonInteractive = hasTitle || hasBody || hasMimeType;

    // resolveWikiPageInput 을 spinner 보다 먼저 호출 (validation-before-spinner)
    const { wikiId, pageId } = await resolveWikiPageInput(client, {
      projectArg: arg1,
      pageIdArg: arg2,
      idOpt: opts.id,
      urlOpt: opts.url,
      project: opts.project,
    });

    if (!nonInteractive) {
      // 기존 $EDITOR flow
      // spinner 는 이 분기 안에서만 켠다. 비대화형은 여기서 조회하지 않으므로
      // 바깥에 두면 하지 않은 조회를 완료했다고 보고하게 된다.
      startSpinner("위키 정보 조회 중...");
      const res = await client.getWikiPage(wikiId, pageId);
      const page = res.result;
      stopSpinner(true, "위키 페이지 조회 완료");

      // 웹은 text/x-markdown 본문만 받는다. 편집을 마친 뒤에 거절하면 편집한 내용이 사라지므로 편집기를 열기 전에 막는다.
      const existingMimeType = page.body?.mimeType;
      if (config.authMode === "web" && existingMimeType && existingMimeType !== "text/x-markdown") {
        throw new DoorayCliError(
          "웹은 본문 형식으로 text/x-markdown 만 받습니다. 웹 방식에서는 지원하지 않습니다. auth-mode 를 api-key 로 바꾸세요.",
          EXIT_PARAM_ERROR,
        );
      }

      const original = serializeWikiFrontmatter(page);
      const edited = await openInEditor(original);

      if (original === edited) {
        process.stdout.write("변경사항 없음\n");
        return;
      }

      const parsed = parseWikiFrontmatter(edited);

      startSpinner("위키 페이지 수정 중...");
      await client.updateWikiPage(wikiId, pageId, {
        subject: parsed.title,
        body: {
          mimeType: resolveBodyMimeType(page.body?.mimeType, opts.mimeType),
          content: parsed.body,
        },
      });
      stopSpinner(true, "위키 페이지 수정 완료");
      process.stdout.write(`위키 페이지가 수정되었습니다: ${pageId}\n`);
      return;
    }

    // 비대화형 분기. 아래 각 API 호출이 자기 spinner 를 따로 켠다.

    // $EDITOR flow 와 달리 원본을 들고 있지 않아 필요할 때만 한 번 더 조회한다.
    // 조회가 필요한 경우는 둘이다.
    // - 본문을 바꾸는데 --mime-type 이 없으면 보존할 형식을 알아야 한다
    // - --mime-type 만 주면 함께 보낼 기존 본문을 알아야 한다. 형식만 바꾸는
    //   엔드포인트가 없어 content 를 같이 실어야 하기 때문이다
    // 제목만 수정하거나 본문과 --mime-type 을 함께 주면 조회하지 않는다.
    const needsFetch = hasBody !== hasMimeType;
    let existingMimeType: string | undefined;
    let existingContent: string | undefined;
    if (needsFetch) {
      startSpinner("위키 페이지 조회 중...");
      const res = await client.getWikiPage(wikiId, pageId);
      existingMimeType = res.result.body?.mimeType;
      existingContent = res.result.body?.content;
      stopSpinner(true, "위키 페이지 조회 완료");
    }

    const bodyMimeType = resolveBodyMimeType(existingMimeType, opts.mimeType);
    warnUnconvertedBody(existingMimeType, opts.mimeType, hasBody);
    // --mime-type 단독일 때는 기존 본문을 그대로 다시 보낸다.
    const bodyContent = hasBody ? await readBodyInput(opts) : existingContent;

    if (hasMimeType && !hasBody && bodyContent == null) {
      throw new DoorayCliError(
        "본문이 없는 페이지는 --mime-type 만으로 형식을 바꿀 수 없습니다. --body 또는 --body-file 과 함께 사용해주세요.",
        EXIT_PARAM_ERROR,
      );
    }

    if (bodyContent != null && hasTitle) {
      startSpinner("위키 페이지 수정 중...");
      await client.updateWikiPage(wikiId, pageId, {
        subject: opts.title,
        body: { mimeType: bodyMimeType, content: bodyContent },
      });
    } else if (bodyContent != null) {
      startSpinner("위키 페이지 본문 수정 중...");
      await client.updateWikiPageContent(wikiId, pageId, {
        body: { mimeType: bodyMimeType, content: bodyContent },
      });
    } else {
      startSpinner("위키 페이지 제목 수정 중...");
      await client.updateWikiPageTitle(wikiId, pageId, { subject: opts.title });
    }

    stopSpinner(true, "위키 페이지 수정 완료");
    process.stdout.write(`위키 페이지가 수정되었습니다: ${pageId}\n`);
  });
