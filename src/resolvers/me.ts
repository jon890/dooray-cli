import { DoorayApiClient } from "../api/client.js";
import type { CachedMe } from "../cache/types.js";
import { getMe, setMe, isExpired } from "../cache/store.js";
import { ME_TTL_MS } from "../cache/types.js";
import { DoorayCliError } from "../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../utils/exit-codes.js";

export async function ensureMe(client: DoorayApiClient): Promise<CachedMe> {
  const entry = await getMe();
  if (entry && !isExpired(entry.updatedAt, ME_TTL_MS) && entry.data.orgId) {
    return entry.data;
  }
  const res = await client.getMe();
  const orgId = res.result.defaultOrganization?.id ?? "";
  if (!orgId) {
    throw new DoorayCliError(
      "orgId를 확인할 수 없습니다 (getMe 응답에 defaultOrganization.id 누락). dooray cache clear 후 재시도하세요.",
      EXIT_PARAM_ERROR,
    );
  }
  const cached: CachedMe = {
    id: res.result.id,
    name: res.result.name,
    orgId,
  };
  await setMe(cached);
  return cached;
}
