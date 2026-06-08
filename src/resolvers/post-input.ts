import { DoorayApiClient } from "../api/client.js";
import { resolveProject } from "./project.js";
import { resolvePost } from "./post.js";
import { parseDoorayTaskUrl, isLikelyDoorayUrl } from "../utils/dooray-url.js";
import { DoorayCliError } from "../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../utils/exit-codes.js";

export type PostInputTokenType = "postId" | "postNumber" | "url" | "project";

/**
 * 입력 토큰을 형태로 분류. 추론을 '명시화' 하는 단일 분류기.
 * - url:        http(s):// 로 시작
 * - postId:     15자리 이상 numeric (Dooray postId 는 19자리, ADR-030 의 15+ 기준과 일관)
 * - postNumber: 1~14자리 numeric (업무 번호 #N)
 * - project:    그 외 (프로젝트 코드 등 비숫자)
 */
export function classifyPostInputToken(token: string): PostInputTokenType {
  if (/^https?:\/\//.test(token)) return "url";
  if (/^\d{15,}$/.test(token)) return "postId";
  if (/^\d+$/.test(token)) return "postNumber";
  return "project";
}

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

const URL_FORMAT_HINT =
  "지원 형식:\n" +
  "  https://x.dooray.com/task/to/{postId}\n" +
  "  https://x.dooray.com/task/{projectId}/{postId}\n" +
  "  https://x.dooray.com/project/tasks/{postId}";

// URL 형식 목록은 URL_FORMAT_HINT 단일 소스를 참조 (중복 정의 회피)
const INPUT_HELP =
  "업무를 식별할 정보가 부족합니다. 다음 중 하나를 입력하세요:\n" +
  "  - <project> <post-number>     예: my-project 337\n" +
  "  - --id <postId>                예: --id 1234567890123456789\n" +
  `  - <Dooray URL>\n  ${URL_FORMAT_HINT}`;

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
        `--url 형식이 올바르지 않습니다: "${urlOpt}"\n${URL_FORMAT_HINT}`,
        EXIT_PARAM_ERROR,
      );
    }
    return resolveByPostId(client, postId);
  }

  // 4. --id 단독
  if (idOpt) {
    const idType = classifyPostInputToken(idOpt);
    if (idType === "postNumber") {
      throw new DoorayCliError(
        `"${idOpt}" 는 업무 번호로 보입니다. <project> <post-number> 형식을 쓰세요:\n` +
          `  dooray post get <project> ${idOpt}`,
        EXIT_PARAM_ERROR,
      );
    }
    if (idType === "url") {
      throw new DoorayCliError(
        `"${idOpt}" 는 URL 형식입니다. --url 옵션을 쓰세요:\n` +
          `  dooray post get --url "${idOpt}"`,
        EXIT_PARAM_ERROR,
      );
    }
    // project (비숫자) 또는 postId → resolveByPostId 에 위임 (의도된 pass-through)
    // 비숫자는 ky 가 URL 인코딩 처리, 존재하지 않는 postId 이므로 서버가 404 로 거부
    return resolveByPostId(client, idOpt);
  }

  // 5. positional 1개이고 URL 형태
  if (projectArg && !postNumberArg && isLikelyDoorayUrl(projectArg)) {
    const postId = parseDoorayTaskUrl(projectArg);
    if (!postId) {
      throw new DoorayCliError(
        `Dooray URL 형식이 올바르지 않습니다: "${projectArg}"\n${URL_FORMAT_HINT}`,
        EXIT_PARAM_ERROR,
      );
    }
    return resolveByPostId(client, postId);
  }

  // 6. positional 2개
  if (projectArg && postNumberArg) {
    const numType = classifyPostInputToken(postNumberArg);
    if (numType === "postId") {
      throw new DoorayCliError(
        `"${postNumberArg}" 는 내부 ID(postId)로 보입니다.\n` +
          `업무 번호(#N)가 아닌 내부 ID 로 조회하려면 --id 옵션을 사용하세요:\n` +
          `  dooray post get --id ${postNumberArg}`,
        EXIT_PARAM_ERROR,
      );
    }
    if (numType !== "postNumber") {
      throw new DoorayCliError(
        `<post-number>가 올바르지 않습니다: "${postNumberArg}"`,
        EXIT_PARAM_ERROR,
      );
    }
    const projectId = await resolveProject(client, projectArg);
    const num = Number(postNumberArg);
    // classifyPostInputToken 이 postNumber 를 보장하므로 NaN 불가하나,
    // 분류 로직 변경 시 NaN <= 0 (false) 로 0번 조회되는 회귀 방지로 isFinite 명시
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
