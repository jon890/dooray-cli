import { afterEach, describe, expect, it, vi } from "vitest";
import { applyReplace } from "../utils/body-replace.js";
import { CR_MARKER, formatHunks, printReplacePreview } from "./body-replace.js";

// ANSI escape 시작 바이트. 리터럴로 두면 편집기에서 보이지 않아 escape 표기로 쓴다.
const ESC = "\u001b";

describe("formatHunks", () => {
  it("바뀌는 줄만 diff 형식으로 낸다", () => {
    const out = formatHunks([{ line: 2, before: "대상 줄", after: "바뀐 줄" }]);
    expect(out).toBe("@@ 1/1 — 2번째 줄 @@\n-대상 줄\n+바뀐 줄\n");
  });

  it("여러 줄 구간은 줄마다 표시를 붙인다", () => {
    const out = formatHunks([{ line: 1, before: "a\nb", after: "c" }]);
    expect(out).toBe("@@ 1/1 — 1번째 줄 @@\n-a\n-b\n+c\n");
  });

  it("서버 본문의 제어문자를 치환한다", () => {
    const out = formatHunks([{ line: 1, before: `${ESC}[31m빨강`, after: "평문" }]);
    expect(out).not.toContain(ESC);
    expect(out).toContain("-?[31m빨강");
  });

  it("탭은 그대로 둔다 (복사해 다음 --old 로 쓸 수 있게)", () => {
    const out = formatHunks([{ line: 1, before: "\t들여쓴 줄", after: "\t\t더 들여쓴 줄" }]);
    expect(out).toContain("-\t들여쓴 줄\n");
    expect(out).toContain("+\t\t더 들여쓴 줄\n");
  });

  it("CR 은 ? 가 아니라 원문 ? 와 구분되는 표기로 보인다", () => {
    const out = formatHunks([{ line: 1, before: "물음?\r\n다음", after: "단독\r끝" }]);
    expect(out).toContain(`-물음?${CR_MARKER}\n-다음\n`);
    expect(out).toContain(`+단독${CR_MARKER}끝\n`);
    expect(out).not.toContain("\r");
    expect(CR_MARKER).not.toBe("?");
  });
});

describe("formatHunks 긴 줄 축약", () => {
  const filler = (ch: string, n: number) => ch.repeat(n);

  it("줄바꿈 없는 5,000자 본문의 중간 치환은 바뀐 곳 주변만 남긴다", () => {
    const content = filler("가", 2500) + "OLD" + filler("나", 2500);
    const result = applyReplace(content, "OLD", "NEW", false);
    const out = formatHunks(result.hunks);

    expect(out.length).toBeLessThan(500);
    expect(out).toContain(`-...${filler("가", 80)}OLD${filler("나", 80)}...\n`);
    expect(out).toContain(`+...${filler("가", 80)}NEW${filler("나", 80)}...\n`);
    // --json 에 쓰이는 hunk 자체는 줄 전체 그대로다
    expect(result.hunks[0]?.before).toBe(content);
    expect(result.hunks[0]?.after.length).toBe(content.length);
  });

  it("짧은 줄은 그대로 둔다", () => {
    const head = filler("a", 160);
    const out = formatHunks([{ line: 1, before: `${head}X${head}`, after: `${head}Y${head}` }]);
    expect(out).toBe(`@@ 1/1 — 1번째 줄 @@\n-${head}X${head}\n+${head}Y${head}\n`);
    expect(out).not.toContain("...");
  });

  it("여러 줄 old 는 줄 수와 줄 번호를 유지하고 첫 줄 앞머리와 끝 줄 뒷부분만 줄인다", () => {
    const longHead = filler("앞", 1000);
    const longTail = filler("뒤", 1000);
    const content = `제목\n${longHead}시작\n가운데\n끝${longTail}\n꼬리`;
    const result = applyReplace(content, "시작\n가운데\n끝", "새 시작\n새 끝", false);
    const out = formatHunks(result.hunks);
    const lines = out.trimEnd().split("\n");

    expect(lines[0]).toBe("@@ 1/1 — 2번째 줄 @@");
    expect(lines.filter((l) => l.startsWith("-"))).toEqual([
      `-...${filler("앞", 80)}시작`,
      "-가운데",
      // 공통 접미는 "끝" 부터라 그 자리부터 80자를 남긴다
      `-끝${filler("뒤", 79)}...`,
    ]);
    expect(lines.filter((l) => l.startsWith("+"))).toEqual([
      `+...${filler("앞", 80)}새 시작`,
      `+새 끝${filler("뒤", 79)}...`,
    ]);
    expect(result.hunks[0]?.before).toBe(`${longHead}시작\n가운데\n끝${longTail}`);
  });

  it("한 줄에 두 군데가 바뀌면(--all) 두 변경 사이는 자르지 않는다", () => {
    const middle = filler("중", 1000);
    const content = `${filler("가", 1000)}OLD${middle}OLD${filler("나", 1000)}`;
    const result = applyReplace(content, "OLD", "NEW", true);
    const out = formatHunks(result.hunks);

    expect(out).toContain(`-...${filler("가", 80)}OLD${middle}OLD${filler("나", 80)}...\n`);
    expect(out).toContain(`+...${filler("가", 80)}NEW${middle}NEW${filler("나", 80)}...\n`);
  });

  it("잘린 경계에서 서로게이트 쌍을 가르지 않는다", () => {
    const emoji = "\u{1F600}";
    // 앞머리는 끝에서 80칸, 뒷부분은 앞에서 80칸 자리가 쌍 가운데(low surrogate)에 오게 맞춘다.
    const head = emoji.repeat(150);
    const tail = "z" + emoji.repeat(150);
    const out = formatHunks([{ line: 1, before: `${head}X${tail}`, after: `${head}Y${tail}` }]);
    for (const l of out.split("\n")) {
      expect(l).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/);
    }
    expect(out).toContain("-...");
    expect(out).toContain("X");
  });
});

describe("printReplacePreview", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function capture(): () => string {
    let out = "";
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      out += String(chunk);
      return true;
    });
    return () => out;
  }

  const result = {
    content: "전체 본문",
    replaced: 2,
    hunks: [{ line: 3, before: "a x x", after: "a y y" }],
  };

  it("--quiet 이면 바뀔 군데 수만 한 줄로 낸다", () => {
    const read = capture();
    printReplacePreview({ quiet: true }, { postId: "post-1" }, result, "text/x-markdown");
    expect(read()).toBe("2\n");
  });

  it("--json 이면 대상 id 와 구간을 구조로 내고 본문 전체는 넣지 않는다", () => {
    const read = capture();
    printReplacePreview({ json: true }, { pageId: "page-1" }, result, "text/html");
    expect(JSON.parse(read())).toEqual({
      dryRun: true,
      pageId: "page-1",
      replaced: 2,
      mimeType: "text/html",
      hunks: result.hunks,
    });
  });

  it("기본 출력은 diff 와 요약 한 줄이다", () => {
    const read = capture();
    printReplacePreview({}, { postId: "post-1" }, result, "text/x-markdown");
    expect(read()).toBe("@@ 1/1 — 3번째 줄 @@\n-a x x\n+a y y\n2군데가 바뀝니다 (dry-run, 수정하지 않음).\n");
  });
});
