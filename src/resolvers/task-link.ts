import type { DoorayApiClient } from "../api/client.js";
import { resolvePostInput } from "./post-input.js";
import { parseLinkRef, type TaskLinkInput } from "../utils/task-link.js";

export async function resolveTaskLinks(
  client: DoorayApiClient,
  linkInputs: string[],
): Promise<TaskLinkInput[]> {
  return Promise.all(
    linkInputs.map(async (ref) => {
      const { projectArg, postNumberArg, idOpt } = parseLinkRef(ref);
      const { projectId, postId, projectCode, postNumber } = await resolvePostInput(
        client,
        { projectArg, postNumberArg, idOpt },
      );
      const detail = await client.getPost(projectId, postId);
      return {
        projectCode,
        number: postNumber,
        postId,
        subject: detail.result.subject,
        workflowClass: detail.result.workflowClass,
      };
    }),
  );
}
