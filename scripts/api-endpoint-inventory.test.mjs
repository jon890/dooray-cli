import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  compareEndpoints,
  extractImplEndpoints,
  listPublicSources,
  parseOfficialEndpoints,
} from "./api-endpoint-inventory.mjs";

const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const officialSnapshot = parseOfficialEndpoints(
  readFileSync(join(repoRoot, "docs/api/official-endpoints.txt"), "utf8"),
);

describe("compareEndpoints 의 문서에 없는 줄 알고 쓰는 목록", () => {
  it("등록된 경로는 missingInOfficial 이 아니라 knownUndocumented 로 간다", () => {
    const result = compareEndpoints(["GET messenger/v1/channels/{id}/logs"], []);

    expect(result.missingInOfficial).toEqual([]);
    expect(result.knownUndocumented).toEqual(["GET messenger/v1/channels/{id}/logs"]);
  });

  it("등록되지 않은 경로는 그대로 missingInOfficial 에 남는다", () => {
    const result = compareEndpoints(["GET messenger/v1/channels/{id}/unknown"], []);

    expect(result.missingInOfficial).toEqual(["GET messenger/v1/channels/{id}/unknown"]);
    expect(result.knownUndocumented).toEqual([]);
  });

  it("공식에도 있으면 어느 목록에도 넣지 않는다", () => {
    const entry = "GET messenger/v1/channels/{id}/logs";
    const result = compareEndpoints([entry], [entry]);

    expect(result.matched).toBe(1);
    expect(result.missingInOfficial).toEqual([]);
    expect(result.knownUndocumented).toEqual([]);
  });
});

describe("extractImplEndpoints", () => {
  it("평문 경로를 뽑는다", () => {
    const source = `return await http.api.get("wiki/v1/wikis").json<WikiListResponse>();`;

    expect(extractImplEndpoints(source).endpoints).toEqual(["GET wiki/v1/wikis"]);
  });

  it("작은따옴표 평문 경로도 뽑는다", () => {
    const source = `await http.api.get('common/v1/members/me').json();`;

    expect(extractImplEndpoints(source).endpoints).toEqual(["GET common/v1/members/me"]);
  });

  it("여러 줄에 걸친 호출을 뽑는다", () => {
    const source = [
      "      return await http.api",
      "        .get(`wiki/v1/wikis/${wikiId}/pages/${pageId}`)",
      "        .json<WikiPageResponse>();",
    ].join("\n");

    expect(extractImplEndpoints(source).endpoints).toEqual(["GET wiki/v1/wikis/{id}/pages/{id}"]);
  });

  it("템플릿 리터럴의 `${...}` 를 모두 `{id}` 로 바꾼다", () => {
    const source = "await http.api.put(`project/v1/projects/${projectId}/posts/${postId}`).json();";

    expect(extractImplEndpoints(source).endpoints).toEqual(["PUT project/v1/projects/{id}/posts/{id}"]);
  });

  it("중괄호가 중첩된 표현식도 하나의 `{id}` 로 바꾼다", () => {
    const source = "await http.api.get(`project/v1/projects/${map[`${key}`]}/posts`).json();";

    expect(extractImplEndpoints(source).endpoints).toEqual(["GET project/v1/projects/{id}/posts"]);
  });

  it("두 번째 인자의 searchParams 가 결과에 섞이지 않는다", () => {
    const source = [
      "      return await http.api",
      "        .get(`project/v1/projects/${projectId}/posts`, {",
      "          searchParams: { page: 0, size: 100, order: '-createdAt' },",
      "        })",
      "        .json<PostListResponse>();",
    ].join("\n");

    expect(extractImplEndpoints(source).endpoints).toEqual(["GET project/v1/projects/{id}/posts"]);
  });

  it("메서드 이름을 대문자로 낸다", () => {
    const source = [
      'http.api.post("a/v1/x");',
      'http.api.put("b/v1/x");',
      'http.api.delete("c/v1/x");',
      'http.api.patch("d/v1/x");',
    ].join("\n");

    expect(extractImplEndpoints(source).endpoints).toEqual([
      "DELETE c/v1/x",
      "PATCH d/v1/x",
      "POST a/v1/x",
      "PUT b/v1/x",
    ]);
  });

  it("`http.url(` 로 만든 raw fetch 경로를 method 값과 함께 뽑는다", () => {
    const source = [
      "      const url = http.url(`wiki/v1/wikis/${wikiId}/pages/${pageId}/files`);",
      "      const res = await fetch(url, {",
      '        method: "POST",',
      "        headers: { Authorization: http.authHeader },",
      "        body: buildFormData(),",
      "      });",
    ].join("\n");

    expect(extractImplEndpoints(source).endpoints).toEqual(["POST wiki/v1/wikis/{id}/pages/{id}/files"]);
  });

  it("`http.api = ...` 대입은 호출로 세지 않는다", () => {
    const source = ["http.api = createApi({", '  prefix: baseUrl,', "});"].join("\n");

    expect(extractImplEndpoints(source).endpoints).toEqual([]);
  });

  it("호출이 없는 소스에서 빈 목록을 낸다", () => {
    expect(extractImplEndpoints("").endpoints).toEqual([]);
  });

  it("같은 경로를 두 번 불러도 한 번만 낸다", () => {
    const source = ['http.api.get("wiki/v1/wikis");', 'http.api.get("wiki/v1/wikis");'].join("\n");

    expect(extractImplEndpoints(source).endpoints).toEqual(["GET wiki/v1/wikis"]);
  });
});

describe("parseOfficialEndpoints", () => {
  it("placeholder 이름이 달라도 같은 경로로 정규화한다", () => {
    const content = [
      "GET /project/v1/projects/{project-id}",
      "GET /project/v1/projects/{projectId}",
    ].join("\n");

    expect(parseOfficialEndpoints(content)).toEqual(["GET project/v1/projects/{id}"]);
  });

  it("쿼리 문자열을 뗀다", () => {
    const content = "GET /drive/v1/drives/{drive-id}/files/{file-id}?media=raw";

    expect(parseOfficialEndpoints(content)).toEqual(["GET drive/v1/drives/{id}/files/{id}"]);
  });

  it("`#` 로 시작하는 주석 줄과 빈 줄을 건너뛴다", () => {
    const content = ["# 뽑은 날짜: 2026-09-07", "", "GET /wiki/v1/wikis", "# 꼬리 주석"].join("\n");

    expect(parseOfficialEndpoints(content)).toEqual(["GET wiki/v1/wikis"]);
  });

  it("앞의 `/` 를 뗀다", () => {
    expect(parseOfficialEndpoints("POST /wiki/v1/wikis/{wiki-id}/pages")).toEqual([
      "POST wiki/v1/wikis/{id}/pages",
    ]);
  });

  it("주석만 있는 본문에서 빈 목록을 낸다", () => {
    expect(parseOfficialEndpoints("# 주석뿐이다\n")).toEqual([]);
  });
});

describe("compareEndpoints", () => {
  it("넷으로 나눠 낸다", () => {
    const impl = ["GET a/v1/x", "GET a/v1/only-impl"];
    const official = ["GET a/v1/x", "GET a/v1/only-official"];

    expect(compareEndpoints(impl, official)).toEqual({
      matched: 1,
      missingInImpl: ["GET a/v1/only-official"],
      missingInOfficial: ["GET a/v1/only-impl"],
      knownUndocumented: [],
    });
  });

  it("양쪽이 비면 넷 다 비어 있다", () => {
    expect(compareEndpoints([], [])).toEqual({
      matched: 0,
      missingInImpl: [],
      missingInOfficial: [],
      knownUndocumented: [],
    });
  });
});

describe("공식 목록 스냅샷의 정정 대상 endpoint", () => {
  it("위키 페이지 이동 endpoint 가 들어 있다", () => {
    expect(officialSnapshot).toContain("POST wiki/v1/wikis/{id}/pages/{id}/move");
  });

  it("위키 페이지 단건 조회(page-only fetch) endpoint 가 들어 있다", () => {
    expect(officialSnapshot).toContain("GET wiki/v1/pages/{id}");
  });

  it("위키 페이지 삭제 endpoint 가 들어 있다", () => {
    expect(officialSnapshot).toContain("DELETE wiki/v1/wikis/{id}/pages/{id}");
  });
});

describe("리뷰 반영", () => {
  it("경로가 리터럴이 아닌 호출을 세고 목록에서 뺀다", () => {
    const source = 'return await http.api\n  .get(buildUrl(projectId))\n  .json();';
    const out = extractImplEndpoints(source);
    expect(out.endpoints).toEqual([]);
    expect(out.nonLiteral).toBe(1);
  });

  it("apiPath tagged template 의 경로를 리터럴처럼 읽는다", () => {
    const source =
      'await http.api\n  .get(apiPath`project/v1/projects/${projectId}/posts`)\n  .json();\n' +
      'const url = http.url(apiPath`wiki/v1/wikis/${wikiId}/pages/${pageId}/files`);\n' +
      'await fetch(url, { method: "POST" });';
    const out = extractImplEndpoints(source);
    expect(out.nonLiteral).toBe(0);
    expect(out.endpoints).toEqual([
      "GET project/v1/projects/{id}/posts",
      "POST wiki/v1/wikis/{id}/pages/{id}/files",
    ]);
  });

  it("뒤 슬래시가 있는 공식 경로를 같은 경로로 정규화한다", () => {
    const content = "GET /calendar/v1/calendars\nGET /calendar/v1/calendars/\n";
    expect(parseOfficialEndpoints(content)).toEqual(["GET calendar/v1/calendars"]);
  });

  it("raw fetch 가 나란히 있으면 각자의 method 를 집는다", () => {
    const source = [
      'const a = http.url(apiPath`project/v1/a`);',
      'await fetch(a, { method: "POST" });',
      'const b = http.url(apiPath`project/v1/b`);',
      'await fetch(b, { method: "DELETE" });',
    ].join("\n");
    const { endpoints } = extractImplEndpoints(source);
    expect(endpoints).toContain("POST project/v1/a");
    expect(endpoints).toContain("DELETE project/v1/b");
  });
});

describe("공개 구현 소스 찾기와 호출 꼴", () => {
  it("this.api 나 ky 인스턴스를 직접 부르는 옛 꼴은 세지 않는다", () => {
    const source = 'await this.api.get("wiki/v1/wikis");\nawait api.get("wiki/v1/pages");';

    expect(extractImplEndpoints(source)).toEqual({ endpoints: [], nonLiteral: 0 });
  });

  it("http.url 의 일반 템플릿 리터럴(apiPath 없이)도 읽는다", () => {
    const source = ["const url = http.url(`calendar/v1/calendars/${id}/events`);", 'await fetch(url, { method: "POST" });'].join("\n");

    expect(extractImplEndpoints(source).endpoints).toEqual(["POST calendar/v1/calendars/{id}/events"]);
  });

  it("경로가 변수인 http.api 호출은 읽지 못한 것으로 센다", () => {
    const source = "await http.api.post(req.path, { json: req.json });";

    expect(extractImplEndpoints(source)).toEqual({ endpoints: [], nonLiteral: 1 });
  });

  it("api/public/ 과 api/<영역>/public*.ts 만 고르고 테스트·웹 구현은 뺀다", () => {
    const root = mkdtempSync(join(tmpdir(), "dooray-inventory-"));
    try {
      const files = [
        "src/api/public/http.ts",
        "src/api/public/index.ts",
        "src/api/public/http.test.ts",
        "src/api/post/public.ts",
        "src/api/post/public-file.ts",
        "src/api/post/public.test.ts",
        "src/api/post/web.ts",
        "src/api/post/types.ts",
        "src/api/mail/imap.ts",
        "src/api/client.ts",
      ];
      for (const file of files) {
        mkdirSync(join(root, file, ".."), { recursive: true });
        writeFileSync(join(root, file), "");
      }

      expect(listPublicSources(root)).toEqual([
        "src/api/post/public-file.ts",
        "src/api/post/public.ts",
        "src/api/public/http.ts",
        "src/api/public/index.ts",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
