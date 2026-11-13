import type { DoorayClient } from "../api/dooray-client.js";
import { DoorayCliError } from "../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../utils/exit-codes.js";

export async function resolvePost(
  client: DoorayClient,
  projectId: string,
  postNumber: number,
): Promise<string> {
  const res = await client.getPosts(projectId, {
    postNumber: String(postNumber),
  });

  if (res.result.length === 0) {
    throw new DoorayCliError(
      `업무를 찾을 수 없습니다: #${postNumber}`,
      EXIT_PARAM_ERROR,
    );
  }

  return res.result[0].id;
}
