import { DoorayApiClient } from "../api/client.js";
import { resolveProject } from "./project.js";
import { resolvePost } from "./post.js";
import { parseDoorayTaskUrl, isLikelyDoorayUrl } from "../utils/dooray-url.js";
import { DoorayCliError } from "../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../utils/exit-codes.js";

export interface PostInputArgs {
  projectArg?: string;
  postNumberArg?: string;
  idOpt?: string;
  urlOpt?: string;
}

export interface ResolvedPostInput {
  projectId: string;
  postId: string;
  projectCode: string;
  postNumber: number;
}

const INPUT_HELP =
  "업무를 식별할 정보가 부족합니다. 다음 중 하나를 입력하세요:\n" +
  "  - <project> <post-number>     예: tc-ocr 337\n" +
  "  - --id <postId>                예: --id 4319587406666362045\n" +
  "  - <Dooray URL>                 예: https://x.dooray.com/task/to/4319587406666362045";

async function resolveByPostId(
  client: DoorayApiClient,
  postId: string,
): Promise<ResolvedPostInput> {
  const res = await client.getPostStandalone(postId);
  const d = res.result;
  return {
    projectId: d.project.id,
    projectCode: d.project.code,
    postId: d.id,
    postNumber: d.number,
  };
}

export async function resolvePostInput(
  client: DoorayApiClient,
  args: PostInputArgs,
): Promise<ResolvedPostInput> {
  const { projectArg, postNumberArg, idOpt, urlOpt } = args;
  const hasPositional = !!projectArg || !!postNumberArg;

  // 1. --id + --url 동시 → 에러
  if (idOpt && urlOpt) {
    throw new DoorayCliError(
      "--id와 --url은 동시에 사용할 수 없습니다.",
      EXIT_PARAM_ERROR,
    );
  }

  // 2. 옵션 + positional 동시 → 에러
  if ((idOpt || urlOpt) && hasPositional) {
    throw new DoorayCliError(
      "--id/--url과 positional 인자(<project> <post-number>)는 동시에 사용할 수 없습니다.",
      EXIT_PARAM_ERROR,
    );
  }

  // 3. --url 단독
  if (urlOpt) {
    const postId = parseDoorayTaskUrl(urlOpt);
    if (!postId) {
      throw new DoorayCliError(
        `--url 형식이 올바르지 않습니다: "${urlOpt}"\n예: https://x.dooray.com/task/to/4319587406666362045`,
        EXIT_PARAM_ERROR,
      );
    }
    return resolveByPostId(client, postId);
  }

  // 4. --id 단독
  if (idOpt) {
    return resolveByPostId(client, idOpt);
  }

  // 5. positional 1개이고 URL 형태
  if (projectArg && !postNumberArg && isLikelyDoorayUrl(projectArg)) {
    const postId = parseDoorayTaskUrl(projectArg);
    if (!postId) {
      throw new DoorayCliError(
        `Dooray URL 형식이 올바르지 않습니다: "${projectArg}"\n예: https://x.dooray.com/task/to/4319587406666362045`,
        EXIT_PARAM_ERROR,
      );
    }
    return resolveByPostId(client, postId);
  }

  // 6. positional 2개 (기존 경로)
  if (projectArg && postNumberArg) {
    const projectId = await resolveProject(client, projectArg);
    const num = Number(postNumberArg);
    if (!Number.isFinite(num) || num <= 0) {
      throw new DoorayCliError(
        `<post-number>가 올바르지 않습니다: "${postNumberArg}"`,
        EXIT_PARAM_ERROR,
      );
    }
    const postId = await resolvePost(client, projectId, num);
    return { projectId, projectCode: projectArg, postId, postNumber: num };
  }

  // 7. 기타: 명시적 안내 에러
  throw new DoorayCliError(INPUT_HELP, EXIT_PARAM_ERROR);
}
