import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  compareEndpoints,
  extractImplEndpoints,
  parseOfficialEndpoints,
} from "./api-endpoint-inventory.mjs";

const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const officialSnapshot = parseOfficialEndpoints(
  readFileSync(join(repoRoot, "docs/api/official-endpoints.txt"), "utf8"),
);

describe("extractImplEndpoints", () => {
  it("평문 경로를 뽑는다", () => {
    const source = `return await this.api.get("wiki/v1/wikis").json<WikiListResponse>();`;

    expect(extractImplEndpoints(source).endpoints).toEqual(["GET wiki/v1/wikis"]);
  });

  it("작은따옴표 평문 경로도 뽑는다", () => {
    const source = `await this.api.get('common/v1/members/me').json();`;

    expect(extractImplEndpoints(source).endpoints).toEqual(["GET common/v1/members/me"]);
  });

  it("여러 줄에 걸친 호출을 뽑는다", () => {
    const source = [
      "      return await this.api",
      "        .get(`wiki/v1/wikis/${wikiId}/pages/${pageId}`)",
      "        .json<WikiPageResponse>();",
    ].join("\n");

    expect(extractImplEndpoints(source).endpoints).toEqual(["GET wiki/v1/wikis/{id}/pages/{id}"]);
  });

  it("템플릿 리터럴의 `${...}` 를 모두 `{id}` 로 바꾼다", () => {
    const source = "await this.api.put(`project/v1/projects/${projectId}/posts/${postId}`).json();";

    expect(extractImplEndpoints(source).endpoints).toEqual(["PUT project/v1/projects/{id}/posts/{id}"]);
  });

  it("중괄호가 중첩된 표현식도 하나의 `{id}` 로 바꾼다", () => {
    const source = "await this.api.get(`project/v1/projects/${map[`${key}`]}/posts`).json();";

    expect(extractImplEndpoints(source).endpoints).toEqual(["GET project/v1/projects/{id}/posts"]);
  });

  it("두 번째 인자의 searchParams 가 결과에 섞이지 않는다", () => {
    const source = [
      "      return await this.api",
      "        .get(`project/v1/projects/${projectId}/posts`, {",
      "          searchParams: { page: 0, size: 100, order: '-createdAt' },",
      "        })",
      "        .json<PostListResponse>();",
    ].join("\n");

    expect(extractImplEndpoints(source).endpoints).toEqual(["GET project/v1/projects/{id}/posts"]);
  });

  it("메서드 이름을 대문자로 낸다", () => {
    const source = [
      'this.api.post("a/v1/x");',
      'this.api.put("b/v1/x");',
      'this.api.delete("c/v1/x");',
      'this.api.patch("d/v1/x");',
    ].join("\n");

    expect(extractImplEndpoints(source).endpoints).toEqual([
      "DELETE c/v1/x",
      "PATCH d/v1/x",
      "POST a/v1/x",
      "PUT b/v1/x",
    ]);
  });

  it("`${this.baseUrl}` 로 시작하는 raw fetch 경로를 method 값과 함께 뽑는다", () => {
    const source = [
      "      const url = `${this.baseUrl}wiki/v1/wikis/${wikiId}/pages/${pageId}/files`;",
      "      const res = await fetch(url, {",
      '        method: "POST",',
      "        headers: { Authorization: this.authHeader },",
      "        body: buildFormData(),",
      "      });",
    ].join("\n");

    expect(extractImplEndpoints(source).endpoints).toEqual(["POST wiki/v1/wikis/{id}/pages/{id}/files"]);
  });

  it("`this.api = ky.create(...)` 대입은 호출로 세지 않는다", () => {
    const source = ["this.api = ky.create({", '  prefix: baseUrl,', "});"].join("\n");

    expect(extractImplEndpoints(source).endpoints).toEqual([]);
  });

  it("호출이 없는 소스에서 빈 목록을 낸다", () => {
    expect(extractImplEndpoints("").endpoints).toEqual([]);
  });

  it("같은 경로를 두 번 불러도 한 번만 낸다", () => {
    const source = ['this.api.get("wiki/v1/wikis");', 'this.api.get("wiki/v1/wikis");'].join("\n");

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
  it("셋으로 갈라 낸다", () => {
    const impl = ["GET a/v1/x", "GET a/v1/only-impl"];
    const official = ["GET a/v1/x", "GET a/v1/only-official"];

    expect(compareEndpoints(impl, official)).toEqual({
      matched: 1,
      missingInImpl: ["GET a/v1/only-official"],
      missingInOfficial: ["GET a/v1/only-impl"],
    });
  });

  it("양쪽이 비면 셋 다 비어 있다", () => {
    expect(compareEndpoints([], [])).toEqual({
      matched: 0,
      missingInImpl: [],
      missingInOfficial: [],
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
    const source = 'return await this.api\n  .get(buildUrl(projectId))\n  .json();';
    const out = extractImplEndpoints(source);
    expect(out.endpoints).toEqual([]);
    expect(out.nonLiteral).toBe(1);
  });

  it("뒤 슬래시가 있는 공식 경로를 같은 경로로 정규화한다", () => {
    const content = "GET /calendar/v1/calendars\nGET /calendar/v1/calendars/\n";
    expect(parseOfficialEndpoints(content)).toEqual(["GET calendar/v1/calendars"]);
  });

  it("raw fetch 가 나란히 있으면 각자의 method 를 집는다", () => {
    const source = [
      'const a = `${this.baseUrl}/project/v1/a`;',
      'await fetch(a, { method: "POST" });',
      'const b = `${this.baseUrl}/project/v1/b`;',
      'await fetch(b, { method: "DELETE" });',
    ].join("\n");
    const { endpoints } = extractImplEndpoints(source);
    expect(endpoints).toContain("POST project/v1/a");
    expect(endpoints).toContain("DELETE project/v1/b");
  });
});
