import { DoorayApiClient } from "../api/client.js";
import type { CachedTemplate } from "../cache/types.js";
import { getTemplates, setTemplates, isExpired } from "../cache/store.js";
import { TEMPLATES_TTL_MS, RESOLVER_FETCH_PAGE_SIZE } from "../cache/types.js";
import { matchByName } from "./match.js";

const TEMPLATE_ID_RE = /^\d{15,}$/;

async function fetchAllTemplates(client: DoorayApiClient, projectId: string): Promise<CachedTemplate[]> {
  const all: CachedTemplate[] = [];
  let page = 0;
  const size = RESOLVER_FETCH_PAGE_SIZE;
  while (true) {
    const res = await client.getProjectTemplates(projectId, { page, size });
    for (const t of res.result) {
      all.push({ id: t.id, templateName: t.templateName });
    }
    const total = res.totalCount ?? all.length;
    if (all.length >= total) break;
    page++;
  }
  return all;
}

export async function ensureTemplates(client: DoorayApiClient, projectId: string): Promise<CachedTemplate[]> {
  const entry = await getTemplates(projectId);
  if (entry && !isExpired(entry.updatedAt, TEMPLATES_TTL_MS)) return entry.data;
  const items = await fetchAllTemplates(client, projectId);
  await setTemplates(projectId, items);
  return items;
}

// 15자리 이상 숫자 → 그대로 id 반환 (단건 GET 검증은 caller에서). 그 외 → matchByName 부분일치.
export async function resolveTemplate(
  client: DoorayApiClient,
  projectId: string,
  input: string,
): Promise<string> {
  if (TEMPLATE_ID_RE.test(input)) return input;
  const templates = await ensureTemplates(client, projectId);
  const match = matchByName(
    templates.map((t) => ({ name: t.templateName, id: t.id })),
    input,
    "템플릿",
    (t) => `${t.name} (${t.id})`,
  );
  return match.id;
}
