import { DoorayApiClient } from "../api/client.js";
import { resolveWiki } from "./wiki.js";
import { parseDoorayWikiUrl, isLikelyDoorayUrl } from "../utils/dooray-url.js";
import { DoorayCliError } from "../utils/errors.js";
import { EXIT_PARAM_ERROR, EXIT_API_ERROR } from "../utils/exit-codes.js";

export interface WikiPageInputArgs {
  projectArg?: string;
  pageIdArg?: string;
  idOpt?: string;
  urlOpt?: string;
  project?: string;
}

export interface ResolvedWikiPageInput {
  wikiId: string;
  pageId: string;
}

const INPUT_HELP =
  "위키 페이지를 식별할 정보가 부족합니다. 다음 중 하나를 입력하세요:\n" +
  "  - --id <page-id>                          예: --id 1234567890123456789\n" +
  "  - <project> <page-id>                     예: my-project 1234567890123456789\n" +
  "  - <Dooray URL>                            예: https://x.dooray.com/wiki/<wikiId>/<pageId>\n" +
  "  위키를 이름으로 찾으려면: dooray wiki list --search <위키 이름 일부>\n" +
  "  --project 는 선택입니다. 함께 주면 wikiId 해석 호출을 아낍니다.";

export async function resolveWikiPageInput(
  client: DoorayApiClient,
  args: WikiPageInputArgs,
): Promise<ResolvedWikiPageInput> {
  const { projectArg, pageIdArg, idOpt, urlOpt, project } = args;
  const hasPositional = !!projectArg || !!pageIdArg;

  if (idOpt && urlOpt) {
    throw new DoorayCliError("--id와 --url은 동시에 사용할 수 없습니다.", EXIT_PARAM_ERROR);
  }
  if ((idOpt || urlOpt) && hasPositional) {
    throw new DoorayCliError(
      "--id/--url과 positional 인자(<project> <page-id>)는 동시에 사용할 수 없습니다.",
      EXIT_PARAM_ERROR,
    );
  }

  // 1. --url — wikiId/pageId 둘 다 URL 에서 추출 (project 불요)
  if (urlOpt) {
    const parsed = parseDoorayWikiUrl(urlOpt);
    if (!parsed) {
      throw new DoorayCliError(
        `--url 형식이 올바르지 않습니다: "${urlOpt}"\n예: https://x.dooray.com/wiki/<wikiId>/<pageId>`,
        EXIT_PARAM_ERROR,
      );
    }
    return parsed;
  }

  // 2. positional 1개 & URL 형태 — wikiId/pageId 둘 다 URL 에서 추출
  if (projectArg && !pageIdArg && isLikelyDoorayUrl(projectArg)) {
    const parsed = parseDoorayWikiUrl(projectArg);
    if (!parsed) {
      throw new DoorayCliError(
        `Dooray Wiki URL 형식이 올바르지 않습니다: "${projectArg}"\n예: https://x.dooray.com/wiki/<wikiId>/<pageId>`,
        EXIT_PARAM_ERROR,
      );
    }
    return parsed;
  }

  // 3. --id — project 가 있으면 그것으로 wikiId 해석, 없으면 page-only endpoint 로 wikiId 를 얻는다 (ADR-045)
  if (idOpt) {
    // projectArg 를 fallback 으로 두지 않는다. 위 가드가 --id 와 positional 동시 사용을
    // 이미 EXIT_PARAM_ERROR 로 막으므로 이 지점의 projectArg 는 항상 undefined 다.
    if (project) {
      const wikiId = await resolveWiki(client, project);
      return { wikiId, pageId: idOpt };
    }

    const res = await client.getWikiPageStandalone(idOpt);
    const wikiId = res.result.wikiId;
    if (!wikiId) {
      throw new DoorayCliError(
        `페이지 응답에 wikiId 가 없습니다 (pageId: ${idOpt})`,
        EXIT_API_ERROR,
      );
    }
    return { wikiId, pageId: idOpt };
  }

  // 4. positional 2개 (기본 경로)
  if (projectArg && pageIdArg) {
    const wikiId = await resolveWiki(client, projectArg);
    return { wikiId, pageId: pageIdArg };
  }

  throw new DoorayCliError(INPUT_HELP, EXIT_PARAM_ERROR);
}
