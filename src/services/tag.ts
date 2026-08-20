import { DoorayApiClient } from "../api/client.js";
import type { CreateTagRequest, UpdateTagGroupRequest } from "../api/types.js";
import { clearTags } from "../cache/store.js";

/**
 * 태그 캐시를 지운다. 실패해도 던지지 않고 경고만 낸다.
 * 이 시점에 API 호출은 이미 성공했으므로, 실패로 만들면 사용자가 재시도해 태그가 한 번 더 만들어진다 (ADR-042).
 */
async function invalidateTags(projectId: string): Promise<void> {
  try {
    await clearTags(projectId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write(
      `⚠  태그 캐시 삭제 실패 (변경은 반영됨): ${msg}\n` +
        `   최신 태그가 안 보이면: dooray cache clear\n`,
    );
  }
}

/** 태그를 만들고 그 프로젝트의 태그 캐시를 지운다. 반환값은 만들어진 태그 id 다. */
export async function createTag(
  client: DoorayApiClient,
  projectId: string,
  body: CreateTagRequest,
): Promise<string> {
  const res = await client.createProjectTag(projectId, body);
  await invalidateTags(projectId);
  return res.result.id;
}

/** 태그 그룹 속성을 바꾸고 그 프로젝트의 태그 캐시를 지운다. */
export async function updateTagGroup(
  client: DoorayApiClient,
  projectId: string,
  tagGroupId: string,
  body: UpdateTagGroupRequest,
): Promise<void> {
  await client.updateProjectTagGroup(projectId, tagGroupId, body);
  await invalidateTags(projectId);
}
