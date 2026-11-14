/**
 * 세션 로그 한 줄에서 `post comment add` 가 돌려준 댓글 id 를 찾는다.
 *
 * 두 출력 모양을 읽는다.
 * - 기본 출력: `댓글이 추가되었습니다: <id>`
 * - `--json` 출력: `{ "id": "<id>" }`. 세션 로그(jsonl)에서는 문자열 안에 들어 있어
 *   따옴표와 줄바꿈이 `\"`, `\n` 으로 이스케이프된 채 나온다.
 *
 * `--quiet` 출력은 id 만 한 줄이라 어느 명령의 결과인지 알 수 없어 읽지 않는다.
 * 호출하는 쪽은 찾은 id 를 분류 파일의 댓글 id 와 대조하므로 다른 `{ "id": ... }` 가 섞여도
 * 댓글 id 와 같지 않으면 걸러진다.
 */

const TEXT_PATTERN = /댓글이 추가되었습니다:\s*([A-Za-z0-9_-]+)/g;
const JSON_PATTERN =
  /\{(?:\\n|\\r|\s)*\\?"id\\?"\s*:\s*\\?"([A-Za-z0-9_-]+)\\?"(?:\\n|\\r|\s)*\}/g;

export function extractCommentIds(line, ids = new Set()) {
  for (const pattern of [TEXT_PATTERN, JSON_PATTERN]) {
    for (const match of line.matchAll(pattern)) {
      ids.add(match[1]);
    }
  }
  return ids;
}
