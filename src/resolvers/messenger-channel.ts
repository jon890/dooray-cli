import type { DoorayClient } from "../api/dooray-client.js";
import { matchByName } from "./match.js";

// resolveMember 의 MEMBER_ID_RE 와 동일 패턴
const CHANNEL_ID_RE = /^\d{15,}$/;

/**
 * `--channel` 입력을 channelId 로 해석 (ADR-033).
 * 1. 15자리 이상 숫자 → 그대로 channelId (존재 검증은 후속 send API 4xx 에 위임)
 * 2. 그 외 → `GET /messenger/v1/channels` (내가 속한 방) title 매칭 — 정확 → 부분 → 모호
 *    title 빈값(direct/me 방)은 이름 매칭 불가 → 후보에서 제외 (member-group code 누락 가드와 동일 패턴)
 */
export async function resolveMessengerChannel(
  client: DoorayClient,
  input: string,
): Promise<string> {
  if (CHANNEL_ID_RE.test(input)) {
    return input;
  }

  const res = await client.getMessengerChannels();
  const named = res.result.filter((ch) => !!ch.title);
  const adapter = named.map((ch) => ({ name: ch.title, id: ch.id }));
  const match = matchByName(adapter, input, "대화방", (ch) => `${ch.name} (${ch.id})`, {
    // matchByName 이 앞에 "전체 목록: " 을 붙인다. 1:1 방은 제목이 없어 이름으로 못 찾으므로 id 를 얻는 길을 알린다.
    helpHint:
      "dooray messenger channels --all — 여기서 찾은 channelId 직접 입력 (1:1 방은 제목이 없어 id 로만 넘길 수 있다. --all 이 없으면 숨긴 방과 보관된 방은 목록에서 빠진다)",
  });
  return match.id;
}
