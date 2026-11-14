import type { ProjectClient } from "@/api/project/types.js";
import type { WikiClient } from "@/api/wiki/types.js";
import type { Wiki } from "@/api/wiki/types.js";
import { getProjects, getPrivateProjects, getWikis, setWikis, isExpired } from "../cache/store.js";
import { WIKIS_TTL_MS, type CachedProject, type CachedWiki } from "../cache/types.js";
import { DoorayCliError } from "../utils/errors.js";
import { EXIT_PARAM_ERROR, EXIT_API_ERROR } from "../utils/exit-codes.js";
import { resolveProject, ensurePrivateProjects, PROJECT_ID_RE } from "./project.js";

export async function fetchAllWikis(client: ProjectClient & WikiClient): Promise<Wiki[]> {
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
  client: ProjectClient & WikiClient,
  projectCode: string,
): Promise<string> {
  // resolveProject 가 공용 목록을 채우고, 거기서 못 찾으면 private 목록도 채운다 (ADR-054)
  const projectId = await resolveProject(client, projectCode);

  const matches = (p: CachedProject) =>
    p.id === projectId || p.code === projectCode || p.id === projectCode;

  const publicEntry = await getProjects();
  const privateEntry = await getPrivateProjects();
  let project = [...(publicEntry?.data ?? []), ...(privateEntry?.data ?? [])].find(matches);

  // 입력이 15자리 이상 numeric 이면 resolveProject 가 캐시를 거치지 않고 그대로 돌려준다 (ADR-030).
  // 그 경로에서는 private 캐시가 비어 있을 수 있으므로 여기서 받아 채우고 다시 찾는다 (ADR-054).
  if (!project) {
    project = (await ensurePrivateProjects(client)).find(matches);
  }

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
  client: ProjectClient & WikiClient,
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
