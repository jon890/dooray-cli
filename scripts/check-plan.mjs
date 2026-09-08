#!/usr/bin/env node
// plan 의 phase 파일이 제출 조건을 지켰는지 본다.
//
// 사용법
//   node scripts/check-plan.mjs plan065-fix-json-large-integer-precision
//   node scripts/check-plan.mjs                 tasks/ 아래 status 가 completed 가 아닌 plan 전부
//
// 종료 코드
//   0  위반 없음
//   1  위반 있음 (그 목록을 낸다)
//   2  대상을 찾지 못했거나 파일을 읽지 못했다
//
// `docs/pitfalls/plan/00-checklist.md` 의 11개 항목 중 기계로 판정할 수 있는 다섯을 본다.
// 나머지 여섯은 사람이나 critic 이 판정한다. 그 경계는 그 체크리스트가 소유한다.
//
// plan 을 쓴 쪽이 스스로 11개를 훑으면 대조한 것과 대조했다고 적은 것을 구별할 수 없다.
// 판정을 종료 코드로 남겨 그 구별을 만든다.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

function repoRoot() {
  const r = spawnSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() || null : null;
}

// 성공 기준을 사람의 눈으로만 판정하게 만드는 표현이다.
// executor 는 이런 기준을 통과시킬 방법이 없어 임의로 통과를 선언하게 된다.
const HUMAN_JUDGEMENT = [
  "자연스럽",
  "적절히",
  "적절한",
  "잘 동작",
  "문제없",
  "문제 없",
  "보기 좋",
  "읽기 좋",
  "깔끔",
  "이상 없",
];

export function checkCwdComment(lines) {
  const hits = [];
  let inBash = false;
  let fenceLine = 0;
  let sawCwd = false;

  lines.forEach((line, i) => {
    const t = line.trim();
    if (!inBash && /^```(bash|sh|shell)$/.test(t)) {
      inBash = true;
      fenceLine = i + 1;
      sawCwd = false;
      return;
    }
    if (inBash && t === "```") {
      if (!sawCwd) hits.push({ line: fenceLine, code: "CWD", text: "Bash 블록에 `# cwd:` 주석이 없다" });
      inBash = false;
      return;
    }
    if (inBash && t.startsWith("# cwd:")) sawCwd = true;
  });

  return hits;
}

// 검증 절 안에서만 본다. 본문 산문의 `깔끔한 시그니처` 같은 서술은 성공 기준이 아니다.
// 파일 전체를 훑으면 그런 서술이 잡혀 실제 위반이 출력에 파묻힌다 (실측).
export function checkHumanJudgement(lines) {
  const hits = [];
  let inVerification = false;

  lines.forEach((line, i) => {
    if (/^##\s+검증/.test(line)) {
      inVerification = true;
      return;
    }
    // 검증 절 다음의 같은 수준 헤더에서 끝난다.
    if (inVerification && /^##\s/.test(line)) {
      inVerification = false;
      return;
    }
    if (!inVerification) return;

    for (const word of HUMAN_JUDGEMENT) {
      if (line.includes(word)) {
        hits.push({ line: i + 1, code: "HUMAN", text: `검증 절에 사람 눈으로만 판정하는 표현: ${word}` });
        break;
      }
    }
  });

  return hits;
}

export function checkSedWordBoundary(lines) {
  const hits = [];
  lines.forEach((line, i) => {
    if (/\bsed\b/.test(line) && line.includes("\\b")) {
      hits.push({ line: i + 1, code: "SEDB", text: "sed 의 `\\b` 는 BSD sed 에서 동작하지 않는다. perl 을 쓴다" });
    }
  });
  return hits;
}

export function checkGrepExpectation(lines) {
  const hits = [];
  lines.forEach((line, i) => {
    const t = line.trim();
    if (!/^grep -c\b/.test(t)) return;
    // `# = 1`, `# >= 1`, `# 0` 처럼 기대값 주석이 붙어야 판정할 수 있다.
    if (!/#\s*[<>=]*\s*\d/.test(t)) {
      hits.push({ line: i + 1, code: "GREP", text: "grep -c 에 기대값 주석이 없다" });
    }
  });
  return hits;
}

export function checkCompletionMarking(planName, files) {
  // 마지막 phase 가 index.json 을 completed 로 바꾸라고 지시하는지 본다.
  const phases = files.filter((f) => /^phase-\d+\.md$/.test(f)).sort();
  if (phases.length === 0) return [{ file: planName, line: 0, code: "PHASE", text: "phase 파일이 없다" }];
  return { last: phases[phases.length - 1] };
}

function collectPlans(root, arg) {
  const tasksDir = join(root, "tasks");
  if (!existsSync(tasksDir)) return [];
  if (arg) return existsSync(join(tasksDir, arg)) ? [arg] : [];

  return readdirSync(tasksDir).filter((name) => {
    const idx = join(tasksDir, name, "index.json");
    if (!existsSync(idx)) return false;
    try {
      return JSON.parse(readFileSync(idx, "utf8")).status !== "completed";
    } catch {
      return false;
    }
  });
}

export function main(argv = process.argv.slice(2)) {
  const root = repoRoot();
  if (!root) {
    console.error("git 저장소 안에서 실행한다.");
    return 2;
  }
  process.chdir(root);

  const plans = collectPlans(root, argv[0]);
  if (plans.length === 0) {
    // 이름을 줬는데 없으면 오류다. 미완료 plan 이 하나도 없는 것은 정상 상태다.
    if (argv[0]) {
      console.error(`plan 을 찾지 못했다: ${argv[0]}`);
      return 2;
    }
    console.log("검사할 plan 이 없다. 미완료 plan 이 없다.");
    return 0;
  }

  const violations = [];

  for (const plan of plans) {
    const dir = join(root, "tasks", plan);
    let files;
    try {
      files = readdirSync(dir);
    } catch (e) {
      console.error(`plan 디렉터리를 읽지 못했다: ${plan}: ${e.message}`);
      return 2;
    }

    const phases = files.filter((f) => /^phase-\d+\.md$/.test(f)).sort();
    if (phases.length === 0) {
      violations.push(`${plan}: phase 파일이 없다`);
      continue;
    }

    for (const phase of phases) {
      let lines;
      try {
        lines = readFileSync(join(dir, phase), "utf8").split("\n");
      } catch (e) {
        console.error(`파일을 읽지 못했다: ${plan}/${phase}: ${e.message}`);
        return 2;
      }

      const hits = [
        ...checkCwdComment(lines),
        ...checkHumanJudgement(lines),
        ...checkSedWordBoundary(lines),
        ...checkGrepExpectation(lines),
      ];
      for (const h of hits) {
        violations.push(`${plan}/${phase}:${h.line}  [${h.code}] ${h.text}`);
      }
    }

    // 마지막 phase 가 index.json 마킹을 지시하는지 본다.
    const last = phases[phases.length - 1];
    const lastText = readFileSync(join(dir, last), "utf8");
    if (!/index\.json/.test(lastText)) {
      violations.push(`${plan}/${last}  [MARK] 마지막 phase 에 index.json 완료 마킹 지시가 없다`);
    }
  }

  if (violations.length > 0) {
    console.log(violations.join("\n"));
    console.log("---------------");
    console.log(`위반 ${violations.length}건`);
    return 1;
  }

  console.log(`plan 검사 통과 (${plans.length}건: ${plans.join(", ")})`);
  return 0;
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? "")) {
  process.exitCode = main();
}
