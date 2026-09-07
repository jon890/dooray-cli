import { DoorayApiClient } from "../api/client.js";
import type { Wiki } from "../api/types.js";
import { getProjects, getWikis, setWikis, isExpired } from "../cache/store.js";
import { PROJECTS_TTL_MS, WIKIS_TTL_MS, type CachedWiki } from "../cache/types.js";
import { DoorayCliError } from "../utils/errors.js";
import { EXIT_PARAM_ERROR, EXIT_API_ERROR } from "../utils/exit-codes.js";
import { resolveProject, PROJECT_ID_RE } from "./project.js";

export async function fetchAllWikis(client: DoorayApiClient): Promise<Wiki[]> {
  const all: Wiki[] = [];
  let page = 0;
  const size = 100;

  while (true) {
    const res = await client.getWikis({ page, size });
    if (res.result.length === 0) break;
    all.push(...res.result);
    if (all.length >= res.totalCount) break;
    page++;
  }

  return all;
}

export function filterWikisByName(wikis: Wiki[], keyword: string): Wiki[] {
  if (keyword === "") return wikis;
  const lowerKeyword = keyword.toLowerCase();
  return wikis.filter((w) => w.name.toLowerCase().includes(lowerKeyword));
}

export async function resolveWiki(
  client: DoorayApiClient,
  projectCode: string,
): Promise<string> {
  // resolveProject ensures project cache is fresh
  await resolveProject(client, projectCode);

  const entry = await getProjects();
  const project = entry?.data.find(
    (p) => p.code === projectCode || p.id === projectCode,
  );

  if (!project?.wikiId) {
    const orgIdHint = PROJECT_ID_RE.test(projectCode)
      ? "\n  위키 본문의 페이지 링크는 dooray://<orgId>/pages/<pageId> 형태이고, 앞 숫자는 orgId 입니다.\n" +
        "  orgId 는 project 도 위키 ID 도 아니므로 project 자리에 넣을 수 없습니다.\n" +
        "  그 링크의 뒤 숫자가 페이지 ID 이므로 project 없이 조회할 수 있습니다:\n" +
        "    dooray wiki page get --id <페이지 ID>"
      : "";
    throw new DoorayCliError(
      `프로젝트에 위키가 없습니다: ${projectCode}${orgIdHint}`,
      EXIT_PARAM_ERROR,
    );
  }

  return project.wikiId;
}

export async function resolveWikiHomePageId(
  client: DoorayApiClient,
  wikiId: string,
): Promise<string> {
  const cached = await getWikis();
  const fresh = cached && !isExpired(cached.updatedAt, WIKIS_TTL_MS);

  let wikis: CachedWiki[];
  if (fresh) {
    wikis = cached.data;
  } else {
    const all = await fetchAllWikis(client);
    wikis = all.map((w) => ({
      id: w.id,
      projectId: w.project.id,
      name: w.name,
      homePageId: w.home.pageId,
    }));
    await setWikis(wikis);
  }

  const wiki = wikis.find((w) => w.id === wikiId);
  if (!wiki?.homePageId) {
    throw new DoorayCliError(
      `위키의 home 페이지를 찾을 수 없습니다 (wikiId: ${wikiId})`,
      EXIT_API_ERROR,
    );
  }
  return wiki.homePageId;
}
