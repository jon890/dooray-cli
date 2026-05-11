import { DoorayApiClient } from "../api/client.js";
import { resolveProject } from "./project.js";
import { resolvePost } from "./post.js";
import { DoorayCliError } from "../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../utils/exit-codes.js";

/**
 * 입력 형식:
 *  - "<projectCode>/<postNumber>"  → resolveProject + resolvePost
 *  - 그 외(슬래시 없음)            → raw postId로 간주, 그대로 반환
 */
export async function resolvePostRef(client: DoorayApiClient, ref: string): Promise<string> {
  if (ref.includes("/")) {
    const [code, numStr] = ref.split("/", 2);
    const num = Number(numStr);
    if (!code || !Number.isFinite(num) || num <= 0) {
      throw new DoorayCliError(
        `--parent 형식이 올바르지 않습니다: "${ref}" (예: "my-project/337" 또는 raw postId)`,
        EXIT_PARAM_ERROR,
      );
    }
    const projectId = await resolveProject(client, code);
    return resolvePost(client, projectId, num);
  }
  return ref;
}
