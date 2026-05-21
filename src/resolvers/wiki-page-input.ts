import { DoorayApiClient } from "../api/client.js";
import { resolveWiki } from "./wiki.js";
import { parseDoorayWikiUrl, isLikelyDoorayUrl } from "../utils/dooray-url.js";
import { DoorayCliError } from "../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../utils/exit-codes.js";

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
  "  - <project> <page-id>                    예: my-project 4071828729722696495\n" +
  "  - --id <page-id> --project <project>      (또는 --url)\n" +
  "  - <Dooray URL>                            예: https://x.dooray.com/wiki/<wikiId>/<pageId>";

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

  // 3. --id 단독 — project 필요 (wikiId 해석에 project 필요)
  if (idOpt) {
    const projectCode = project ?? projectArg;
    if (!projectCode) {
      throw new DoorayCliError(
        "--id 모드는 --project <code> 가 필요합니다 (또는 첫 positional 에 project code).",
        EXIT_PARAM_ERROR,
      );
    }
    const wikiId = await resolveWiki(client, projectCode);
    return { wikiId, pageId: idOpt };
  }

  // 4. positional 2개 (기본 경로)
  if (projectArg && pageIdArg) {
    const wikiId = await resolveWiki(client, projectArg);
    return { wikiId, pageId: pageIdArg };
  }

  throw new DoorayCliError(INPUT_HELP, EXIT_PARAM_ERROR);
}
