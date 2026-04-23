import { DoorayApiClient } from "../api/client.js";
import { getProjects, getWikis, setWikis, isExpired } from "../cache/store.js";
import { PROJECTS_TTL_MS, WIKIS_TTL_MS, type CachedWiki } from "../cache/types.js";
import { DoorayCliError } from "../utils/errors.js";
import { EXIT_PARAM_ERROR, EXIT_API_ERROR } from "../utils/exit-codes.js";
import { resolveProject } from "./project.js";

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
    throw new DoorayCliError(
      `프로젝트에 위키가 없습니다: ${projectCode}`,
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
    const res = await client.getWikis({ size: 100 });
    wikis = res.result.map((w) => ({
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
