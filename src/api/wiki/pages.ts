/**
 * 위키 페이지 목록을 부모 아래로 내려가며 모아 주는 조합 함수다.
 * 공개 구현과 웹 구현이 같은 WikiClient 계약의 getWikiPages 로 같은 순회를 하므로 영역 구현 밖에 한 벌만 둔다 (ADR-082).
 */
import type { WikiClient, WikiPage } from "./types.js";

// 한 레벨의 형제 자식 조회를 병렬화하되, 동시 요청 수를 상한으로 제한한다.
// 상한이 없으면 자식이 수백 개인 레벨에서 병렬 요청이 폭증해
// rate limit / 커넥션 고갈 위험이 있다. chunk 를 순서대로 처리해
// 레벨 내 페이지 순서는 그대로 보존한다.
const CONCURRENCY = 10;

/** maxDepth 가 있으면 root 를 1 로 센 깊이까지만 모은다. 없으면 끝까지 모은다. */
export async function collectWikiPages(
  client: Pick<WikiClient, "getWikiPages">,
  wikiId: string,
  maxDepth?: number,
): Promise<WikiPage[]> {
  const all: WikiPage[] = [];
  let level = (await client.getWikiPages(wikiId)).result;
  let depth = 1;
  while (level.length > 0) {
    all.push(...level);
    if (maxDepth !== undefined && depth >= maxDepth) break;
    const next: WikiPage[] = [];
    for (let i = 0; i < level.length; i += CONCURRENCY) {
      const chunk = level.slice(i, i + CONCURRENCY);
      const batches = await Promise.all(
        chunk.map((p) => client.getWikiPages(wikiId, p.id).then((r) => r.result)),
      );
      next.push(...batches.flat());
    }
    level = next;
    depth++;
  }
  return all;
}
