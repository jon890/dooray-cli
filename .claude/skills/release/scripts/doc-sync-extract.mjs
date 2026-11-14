// doc-sync-check.mjs 가 쓰는 순수 함수. git diff 본문에서 새 명령과 옵션 문자열을 뽑는다.
//
// 선언이 여러 줄에 걸쳐도 잡는다. 이런 모양이다.
//   .option(
//     "-y, --yes",
//     "설명",
//   )
// 연속으로 추가된 줄을 한 덩어리로 이어 붙인 뒤 정규식을 적용한다. 지워진 줄과 hunk 경계에서는 덩어리를 끊는다.
// 추가된 줄만 본다. 지워진 줄까지 세면 이미 없앤 것을 문서에서 찾게 된다.

const QUOTED = "\\(\\s*[\"'`]([^\"'`]+)[\"'`]";
const COMMAND_PATTERN = new RegExp(`new Command${QUOTED}`, "g");
const SUBCOMMAND_PATTERN = new RegExp(`\\.command${QUOTED}`, "g");
const OPTION_PATTERN = new RegExp(`(?:\\.option|\\.requiredOption|new Option)${QUOTED}`, "g");

function addedBlocks(diffText) {
  const blocks = [];
  let current = [];
  const flush = () => {
    if (current.length > 0) blocks.push(current.join("\n"));
    current = [];
  };
  for (const line of diffText.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) current.push(line.slice(1));
    else flush();
  }
  flush();
  return blocks;
}

export function extractTargets(diffText) {
  const commands = new Set();
  const options = new Set();
  for (const block of addedBlocks(diffText)) {
    for (const m of block.matchAll(COMMAND_PATTERN)) commands.add(m[1]);
    // `.command("move <project>")` 처럼 인자 표기가 붙으면 첫 낱말만 이름이다.
    for (const m of block.matchAll(SUBCOMMAND_PATTERN)) commands.add(m[1].trim().split(/\s+/)[0]);
    // 옵션 선언은 `--json` 처럼 긴 이름만 있기도 하고 `-y, --yes` 처럼 짧은 플래그가
    // 앞서기도 한다. 따옴표 안 전체를 잡아 그 안에서 긴 이름을 다시 훑는다.
    // 여는 따옴표 바로 뒤에 `--` 를 요구하면 short-first 선언이 통째로 빠진다 (실측).
    for (const m of block.matchAll(OPTION_PATTERN)) {
      for (const o of m[1].matchAll(/--[a-z0-9-]+/gi)) options.add(o[0]);
    }
  }
  return [...commands, ...options];
}
