import { DoorayApiClient } from "../api/client.js";
import type { CachedWorkflow } from "../cache/types.js";
import { getWorkflows, setWorkflows, isExpired } from "../cache/store.js";
import { WORKFLOWS_TTL_MS } from "../cache/types.js";
import { matchByName } from "./match.js";
import { DoorayCliError } from "../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../utils/exit-codes.js";

export async function ensureWorkflows(
  client: DoorayApiClient,
  projectId: string,
): Promise<CachedWorkflow[]> {
  const entry = await getWorkflows(projectId);
  if (entry && !isExpired(entry.updatedAt, WORKFLOWS_TTL_MS)) {
    return entry.data;
  }
  const res = await client.getProjectWorkflows(projectId);
  const items: CachedWorkflow[] = res.result.map((w) => ({
    id: w.id,
    name: w.name,
    class: w.class as CachedWorkflow["class"],
    order: w.order,
  }));
  await setWorkflows(projectId, items);
  return items;
}

export async function resolveWorkflow(
  client: DoorayApiClient,
  projectId: string,
  input: string,
): Promise<string> {
  const workflows = await ensureWorkflows(client, projectId);

  // class 정확일치 우선 (registered/working/closed/backlog)
  const byClass = workflows.filter((w) => w.class === input);
  if (byClass.length === 1) return byClass[0].id;
  if (byClass.length > 1) {
    throw new DoorayCliError(
      `동일 class의 워크플로우가 여러 개입니다: "${input}"`,
      EXIT_PARAM_ERROR,
    );
  }

  const match = matchByName(workflows, input, "워크플로우", (w) => `${w.name} [${w.class}] (${w.id})`);
  return match.id;
}
