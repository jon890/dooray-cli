import { clearCache } from "../cache/store.js";
import { getConfig, saveConfig, setConfigValue } from "../config/store.js";
import type { Config } from "../config/types.js";

/**
 * config 변경이 캐시 전체를 무효로 만드는지 판정한다 (ADR-042).
 *
 * 캐시 디렉터리는 `~/.dooray/cache` 하나이고 계정·환경별로 나뉘지 않는다.
 * `apiKey` 가 바뀌면 계정이 바뀐 것이고 `baseUrl` 이 바뀌면 접속 환경이 바뀐 것이라,
 * 남아 있는 모든 파일이 다른 곳의 데이터가 된다.
 *
 * `tenantName`, IMAP·SMTP 설정, `trackLastRun` 은 캐시가 무엇을 담는지에 영향을 주지 않아 대상이 아니다.
 * 이전 설정이 없으면 판정 자체가 무의미하므로 `false` 다.
 *
 * config 스키마에 키를 추가할 때 이 함수를 다시 본다.
 * 그 값이 캐시가 어느 계정·환경의 것인지를 바꾸면 여기에 넣어야 한다.
 */
export function shouldInvalidateCache(
  prev: Config | null,
  next: Config,
): boolean {
  if (prev === null) return false;
  return prev.apiKey !== next.apiKey || prev.baseUrl !== next.baseUrl;
}

/**
 * 캐시 전체를 지운다. 지운 것이 있었으면 `true` 다.
 *
 * 실패해도 던지지 않고 경고만 낸다. 이 시점에 config 저장은 이미 끝났고,
 * 실패로 만들면 `dooray config set` 을 쓰는 자동화가 깨진다 (ADR-042).
 */
async function invalidateAllCache(): Promise<boolean> {
  try {
    return await clearCache();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write(
      `⚠  캐시 삭제 실패 (설정 변경은 반영됨): ${msg}\n` +
        `   이전 계정·환경의 데이터가 남아 있을 수 있습니다: dooray cache clear\n`,
    );
    return false;
  }
}

/**
 * `config set <key> <value>` 한 건을 저장하고, 캐시가 무효해졌으면 지운다.
 *
 * 알 수 없는 키 검증과 저장은 `setConfigValue` 가 이미 하므로 그 오류를 그대로 통과시킨다.
 *
 * `cacheCleared` 는 판정 결과가 아니라 실제로 지운 것이 있었는지다.
 * `setConfigValue` 는 config 파일이 없을 때 `apiKey: ""` 인 뼈대를 만들어 저장하므로,
 * 새 설치에서 `base-url` 다음 `api-key` 를 넣으면 `prev` 가 `null` 이 아니고 판정이 `true` 가 된다.
 * 그 경우에도 지울 캐시가 없으면 `false` 라 안내가 나오지 않는다.
 */
export async function updateConfigValue(
  key: string,
  value: string,
): Promise<{ cacheCleared: boolean }> {
  const prev = await getConfig();
  await setConfigValue(key, value);
  const next = await getConfig();

  // 방금 저장했으므로 도달하지 않는다. 판정에 넘길 Config 가 없으니 지울 근거도 없다.
  if (next === null) return { cacheCleared: false };

  if (!shouldInvalidateCache(prev, next)) return { cacheCleared: false };
  return { cacheCleared: await invalidateAllCache() };
}

/**
 * config 전체를 갈아 끼우고, 캐시가 무효해졌으면 지운다. `dooray setup` 이 쓴다.
 *
 * 부르는 쪽이 이전 config 를 들고 있어도 직접 비교하지 않는다.
 * 판정 규칙이 두 곳에 생기면 config 키가 늘어날 때 한쪽이 빠진다.
 */
export async function replaceConfig(
  next: Config,
): Promise<{ cacheCleared: boolean }> {
  const prev = await getConfig();
  await saveConfig(next);

  if (!shouldInvalidateCache(prev, next)) return { cacheCleared: false };
  return { cacheCleared: await invalidateAllCache() };
}
