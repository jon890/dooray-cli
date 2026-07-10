import { describe, it, expect } from "vitest";
import {
  serializePostFrontmatter,
  parsePostFrontmatter,
  serializeWikiFrontmatter,
  parseWikiFrontmatter,
} from "./index.js";
import type { PostDetail } from "../api/types.js";

// js-yaml 5 는 default export 를 제거해 `import yaml from "js-yaml"` 가 런타임에
// undefined 가 된다 (esbuild interop). named import 로 마이그레이션한 것을 가드한다.
// 이 경로는 tsc·기존 테스트가 잡지 못하는 런타임 전용이라 왕복 테스트로 고정한다.
describe("editor frontmatter YAML 왕복 (js-yaml named import)", () => {
  it("post frontmatter serialize → parse 왕복", () => {
    const post = {
      subject: 'Title: "quoted"',
      priority: "highest",
      dueDate: null,
      users: { to: [], cc: [] },
      body: { content: "본문 내용" },
    } as unknown as PostDetail;

    const serialized = serializePostFrontmatter(post, []);
    expect(serialized).toContain("subject:");
    expect(serialized).toContain("본문 내용");

    const parsed = parsePostFrontmatter(serialized);
    expect(parsed.subject).toBe('Title: "quoted"');
    expect(parsed.priority).toBe("highest");
    expect(parsed.body).toBe("본문 내용");
  });

  it("wiki frontmatter serialize → parse 왕복", () => {
    const serialized = serializeWikiFrontmatter({
      subject: "위키 제목",
      body: { content: "위키 본문" },
    });
    expect(serialized).toContain("title:");

    const parsed = parseWikiFrontmatter(serialized);
    expect(parsed.title).toBe("위키 제목");
    expect(parsed.body).toBe("위키 본문");
  });
});
