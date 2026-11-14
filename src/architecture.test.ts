/**
 * 계층·영역 의존 규칙을 import 문으로 검사한다 (ADR-082).
 * 규칙의 뜻과 목표 구조는 docs/code-architecture.md 「의존 규칙」 이 소유하고, 이 파일은 그 표를 코드로 옮긴 것이다.
 * 새 의존성 없이 node:fs 로 src 의 .ts 파일을 읽는다. 테스트 파일(*.test.ts)은 검사하지 않는다.
 * 지금 있는 위반은 ALLOWED_VIOLATIONS 로 시작하고, 정리 PR 마다 줄여 마지막에 비운다.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = dirname(fileURLToPath(import.meta.url));

/**
 * 계층마다 import 해도 되는 다른 계층. 같은 계층 안은 언제나 허용한다.
 * 계층 이름은 src 바로 아래 폴더 이름이다. src/index.ts 는 entry, src/version.ts 는 version 이다.
 */
export const LAYER_DEPENDENCIES: Record<string, readonly string[]> = {
  version: [],
  utils: [],
  body: ["utils"],
  config: ["utils"],
  cache: ["utils", "config"],
  api: ["utils", "body", "config", "version"],
  skill: ["utils", "version"],
  editor: ["utils", "body", "api", "cache"],
  formatters: ["utils", "body", "api"],
  resolvers: ["utils", "body", "config", "cache", "api"],
  services: ["utils", "body", "config", "cache", "api"],
  commands: ["utils", "body", "config", "cache", "api", "skill", "editor", "formatters", "resolvers", "services", "version"],
  entry: ["utils", "body", "config", "cache", "api", "skill", "editor", "formatters", "resolvers", "services", "commands", "version"],
};

/**
 * 지금 남아 있는 위반. `<가져오는 파일> -> <가져오는 대상>` 꼴이며 경로는 src 기준이다.
 * 위반을 고치면 이 목록에서 지운다. 고친 뒤에도 남아 있으면 테스트가 실패한다.
 */
export const ALLOWED_VIOLATIONS: readonly string[] = [
  // utils 는 다른 계층을 모르는 잎이어야 한다. 영역 규칙과 상위 계층 타입에 기대는 것들이다.
  "utils/comment-enrich.ts -> api/post/types.ts",
  "utils/feedback-meta.ts -> cache/last-run.ts",
  "utils/mention.ts -> cache/types.ts",
  "utils/task-link.ts -> cache/types.ts",
];

export interface ImportEdge {
  from: string;
  to: string;
}

export function layerOf(file: string): string {
  const parts = file.split("/");
  if (parts.length === 1) return file === "index.ts" ? "entry" : file.replace(/\.ts$/, "");
  return parts[0];
}

/** commands 아래의 영역. 하위 폴더 이름이거나 최상위 파일 이름(.ts 제외)이다. */
function commandAreaOf(file: string): string | undefined {
  const parts = file.split("/");
  if (parts[0] !== "commands" || parts.length < 2) return undefined;
  return parts[1].replace(/\.ts$/, "");
}

type ApiSide = "public" | "web";

/** api 안의 인증 방식 구현. 공개 구현과 웹 구현은 서로 가져오지 않는다. */
function apiSideOf(file: string): ApiSide | undefined {
  if (file === "api/client.ts" || file.startsWith("api/public/") || /^api\/[^/]+\/public(-[^/]+)?\.ts$/.test(file)) {
    return "public";
  }
  if (file.startsWith("api/web/") || /^api\/[^/]+\/web(-[^/]+)?\.ts$/.test(file)) return "web";
  return undefined;
}

/** api/<영역>/ 의 영역 이름. public·web 공용 폴더는 영역이 아니다. */
function apiAreaOf(file: string): string | undefined {
  const parts = file.split("/");
  if (parts[0] !== "api" || parts.length < 3) return undefined;
  if (parts[1] === "public" || parts[1] === "web") return undefined;
  return parts[1];
}

/** 규칙 하나를 어긴 이유. 어기지 않으면 undefined 다. */
export function violationOf(edge: ImportEdge): string | undefined {
  const fromLayer = layerOf(edge.from);
  const toLayer = layerOf(edge.to);
  if (fromLayer !== toLayer) {
    const allowed = LAYER_DEPENDENCIES[fromLayer];
    if (allowed === undefined) return `규칙 표에 없는 계층 ${fromLayer}`;
    if (!allowed.includes(toLayer)) return `${fromLayer} 는 ${toLayer} 를 가져오지 않는다`;
    return undefined;
  }

  const fromArea = commandAreaOf(edge.from);
  const toArea = commandAreaOf(edge.to);
  if (fromArea !== undefined && toArea !== undefined && fromArea !== toArea) {
    return `명령 영역 ${fromArea} 는 다른 명령 영역 ${toArea} 를 가져오지 않는다`;
  }

  const fromSide = apiSideOf(edge.from);
  const toSide = apiSideOf(edge.to);
  if (fromSide !== undefined && toSide !== undefined && fromSide !== toSide) {
    return `api 의 ${fromSide} 구현은 ${toSide} 구현을 가져오지 않는다`;
  }
  const fromApiArea = apiAreaOf(edge.from);
  const toApiArea = apiAreaOf(edge.to);
  if (fromApiArea === "common" && toApiArea !== undefined && toApiArea !== "common") {
    return "api/common/ 은 다른 api 영역을 가져오지 않는다";
  }
  if (fromApiArea !== undefined && ["api/types.ts", "api/client.ts"].includes(edge.to)) {
    return `api 영역 ${fromApiArea} 는 api/types.ts·api/client.ts 를 가져오지 않는다`;
  }
  if (fromApiArea !== undefined && toApiArea !== undefined && fromApiArea !== toApiArea && !edge.to.endsWith("/types.ts")) {
    return `api 영역 ${fromApiArea} 는 다른 영역 ${toApiArea} 의 types.ts 만 가져온다`;
  }
  return undefined;
}

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "fixtures") continue;
      out.push(...listSourceFiles(full));
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") && !entry.name.endsWith(".d.ts")) {
      out.push(full);
    }
  }
  return out;
}

/** 정적 import·export from·동적 import() 의 지정자. 주석 안의 예시는 거르지 않으므로 주석에 import 문을 쓰지 않는다. */
export function importSpecifiers(source: string): string[] {
  const specs: string[] = [];
  const patterns = [
    /^\s*(?:import|export)\b[^'"]*?\bfrom\s*["']([^"']+)["']/gm,
    /^\s*import\s*["']([^"']+)["']/gm,
    /\bimport\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) specs.push(match[1]);
  }
  return specs;
}

function toSourcePath(candidate: string): string | undefined {
  const tries = [candidate.replace(/\.js$/, ".ts"), candidate, `${candidate}.ts`, join(candidate, "index.ts")];
  for (const path of tries) {
    try {
      if (statSync(path).isFile()) return path;
    } catch {
      // 다음 후보를 본다.
    }
  }
  return undefined;
}

/** 지정자를 src 기준 경로로 푼다. 패키지와 node: 빌트인은 undefined 다. */
export function resolveSpecifier(fromFile: string, spec: string): string | undefined {
  let base: string;
  if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = normalize(join(dirname(join(SRC, fromFile)), spec));
  else return undefined;
  const resolved = toSourcePath(base);
  if (resolved === undefined) throw new Error(`${fromFile} 의 import "${spec}" 를 풀지 못했다`);
  return relative(SRC, resolved).split(sep).join("/");
}

function collectEdges(): ImportEdge[] {
  const edges: ImportEdge[] = [];
  for (const full of listSourceFiles(SRC)) {
    const from = relative(SRC, full).split(sep).join("/");
    for (const spec of importSpecifiers(readFileSync(full, "utf8"))) {
      const to = resolveSpecifier(from, spec);
      if (to !== undefined && to !== from) edges.push({ from, to });
    }
  }
  return edges;
}

describe("의존 규칙", () => {
  const edges = collectEdges();
  const violations = new Map<string, string>();
  for (const edge of edges) {
    const reason = violationOf(edge);
    if (reason !== undefined) violations.set(`${edge.from} -> ${edge.to}`, reason);
  }

  it("src 의 import 를 읽는다", () => {
    // 수집이 조용히 비면 규칙 검사가 언제나 통과한다. 그것을 막는 하한이다.
    expect(edges.length).toBeGreaterThan(500);
  });

  it("허용 목록 밖의 위반이 없다", () => {
    const unexpected = [...violations].filter(([key]) => !ALLOWED_VIOLATIONS.includes(key)).map(([key, reason]) => `${key} (${reason})`);
    expect(unexpected, "의존 규칙을 어긴 import 다. docs/code-architecture.md 「의존 규칙」 을 보고 고친다").toEqual([]);
  });

  it("허용 목록에 고쳐진 위반이 남지 않는다", () => {
    const stale = ALLOWED_VIOLATIONS.filter((key) => !violations.has(key));
    expect(stale, "고쳐진 위반이다. ALLOWED_VIOLATIONS 에서 지운다").toEqual([]);
  });
});

describe("규칙 판정", () => {
  it("아래 계층이 위 계층을 가져오면 위반이다", () => {
    expect(violationOf({ from: "utils/x.ts", to: "api/types.ts" })).toBeDefined();
    expect(violationOf({ from: "services/x.ts", to: "resolvers/y.ts" })).toBeDefined();
    expect(violationOf({ from: "api/x.ts", to: "commands/y.ts" })).toBeDefined();
  });

  it("허용한 방향과 같은 계층 안은 위반이 아니다", () => {
    expect(violationOf({ from: "commands/post/get.ts", to: "resolvers/post.ts" })).toBeUndefined();
    expect(violationOf({ from: "utils/a.ts", to: "utils/b.ts" })).toBeUndefined();
    expect(violationOf({ from: "index.ts", to: "commands/post/get.ts" })).toBeUndefined();
  });

  it("명령 영역끼리 가져오면 위반이다", () => {
    expect(violationOf({ from: "commands/post/get.ts", to: "commands/wiki/tree.ts" })).toBeDefined();
    expect(violationOf({ from: "commands/web-support.ts", to: "commands/web-support/post.ts" })).toBeUndefined();
  });

  it("공개 구현과 웹 구현이 서로 가져오면 위반이다", () => {
    expect(violationOf({ from: "api/post/web.ts", to: "api/client.ts" })).toBeDefined();
    expect(violationOf({ from: "api/post/public.ts", to: "api/web/http.ts" })).toBeDefined();
    expect(violationOf({ from: "api/post/web.ts", to: "api/web/http.ts" })).toBeUndefined();
    expect(violationOf({ from: "api/dooray-client.ts", to: "api/client.ts" })).toBeUndefined();
  });

  it("api 영역은 다른 영역의 types.ts 만 가져온다", () => {
    expect(violationOf({ from: "api/post/web.ts", to: "api/member/types.ts" })).toBeUndefined();
    expect(violationOf({ from: "api/post/web.ts", to: "api/member/web.ts" })).toBeDefined();
  });

  it("api 영역은 통합 타입과 공개 클라이언트 진입점으로 돌아가지 않는다", () => {
    for (const from of ["api/post/types.ts", "api/post/web.ts", "api/wiki/public.ts"]) {
      for (const to of ["api/types.ts", "api/client.ts"]) {
        expect(violationOf({ from, to })).toBeDefined();
      }
    }
    expect(violationOf({ from: "api/post/types.ts", to: "api/common/types.ts" })).toBeUndefined();
    expect(violationOf({ from: "api/types.ts", to: "api/post/types.ts" })).toBeUndefined();
    expect(violationOf({ from: "api/client.ts", to: "api/post/types.ts" })).toBeUndefined();
  });

  it("api 공통 타입은 다른 api 영역을 가져오지 않는다", () => {
    for (const to of ["api/post/types.ts", "api/member/types.ts", "api/project/types.ts"]) {
      expect(violationOf({ from: "api/common/types.ts", to })).toBeDefined();
    }
    expect(violationOf({ from: "api/common/types.ts", to: "api/common/other.ts" })).toBeUndefined();
    expect(violationOf({ from: "api/post/types.ts", to: "api/common/types.ts" })).toBeUndefined();
  });

  it("통합 타입 파일은 타입 재내보내기만 남긴다", () => {
    const source = readFileSync(join(SRC, "api/types.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(source.trim()).not.toBe("");
    expect(source.split("\n").filter((line) => line.trim()).every((line) => /^export type \{[^}]+\} from "\.\/[^/]+\/types\.js";$/.test(line))).toBe(true);
  });

  it("import 지정자를 읽고 별칭과 상대 경로를 같은 파일로 푼다", () => {
    const source = ['import { a } from "./a.js";', 'export { b } from "../b.js";', 'import type { C } from "@/c.js";', 'const d = await import("./d.js");'].join("\n");
    expect(importSpecifiers(source)).toEqual(["./a.js", "../b.js", "@/c.js", "./d.js"]);
    expect(resolveSpecifier("commands/post/get.ts", "@/version.js")).toBe("version.ts");
    expect(resolveSpecifier("commands/post/get.ts", "../../version.js")).toBe("version.ts");
    expect(resolveSpecifier("commands/post/get.ts", "commander")).toBeUndefined();
  });
});
