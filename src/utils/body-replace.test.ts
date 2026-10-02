import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";

import { applyReplace, findOccurrences, readReplaceInputs } from "./body-replace.js";
import { DoorayCliError } from "./errors.js";
import { EXIT_PARAM_ERROR } from "./exit-codes.js";

/** stdin 을 파이프 입력처럼 바꾼다. 돌려받은 spy 로 stdin 접근 여부를 확인한다. */
function stubStdin(data: string) {
  const stream = Readable.from([Buffer.from(data)]) as Readable & { isTTY?: boolean };
  stream.isTTY = false;
  return vi.spyOn(process, "stdin", "get").mockReturnValue(stream as unknown as typeof process.stdin);
}

async function expectParamError(promise: Promise<unknown>, message: RegExp): Promise<void> {
  const err = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(DoorayCliError);
  expect((err as DoorayCliError).exitCode).toBe(EXIT_PARAM_ERROR);
  expect((err as Error).message).toMatch(message);
}

function expectThrowParam(fn: () => unknown, message: RegExp): void {
  let caught: unknown;
  try {
    fn();
  } catch (e) {
    caught = e;
  }
  expect(caught).toBeInstanceOf(DoorayCliError);
  expect((caught as DoorayCliError).exitCode).toBe(EXIT_PARAM_ERROR);
  expect((caught as Error).message).toMatch(message);
}

describe("readReplaceInputs", () => {
  let dir: string;

  beforeEach(async () => {
    vi.restoreAllMocks();
    dir = await mkdtemp(join(tmpdir(), "body-replace-"));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(dir, { recursive: true, force: true });
  });

  it("인자로 받은 old·new 를 그대로 돌려준다", async () => {
    await expect(readReplaceInputs({ old: "가", new: "나" })).resolves.toEqual({
      oldText: "가",
      newText: "나",
    });
  });

  it("파일에서 여러 줄 old·new 를 읽는다", async () => {
    const oldPath = join(dir, "old.txt");
    const newPath = join(dir, "new.txt");
    await writeFile(oldPath, "첫 줄\n둘째 줄");
    await writeFile(newPath, "바뀐 첫 줄\n바뀐 둘째 줄");

    await expect(readReplaceInputs({ oldFile: oldPath, newFile: newPath })).resolves.toEqual({
      oldText: "첫 줄\n둘째 줄",
      newText: "바뀐 첫 줄\n바뀐 둘째 줄",
    });
  });

  it("파일 입력은 UTF-8 BOM 과 끝 줄바꿈 하나를 뗀다", async () => {
    const oldPath = join(dir, "old.txt");
    const newPath = join(dir, "new.txt");
    await writeFile(oldPath, "\uFEFF첫 줄\n둘째 줄\n");
    await writeFile(newPath, "바뀐 줄\r\n");

    await expect(readReplaceInputs({ oldFile: oldPath, newFile: newPath })).resolves.toEqual({
      oldText: "첫 줄\n둘째 줄",
      newText: "바뀐 줄",
    });
  });

  it("끝 줄바꿈은 하나만 뗀다", async () => {
    const oldPath = join(dir, "old.txt");
    await writeFile(oldPath, "문단\n\n");

    await expect(readReplaceInputs({ oldFile: oldPath, new: "x" })).resolves.toEqual({
      oldText: "문단\n",
      newText: "x",
    });
  });

  it("stdin 입력도 BOM 과 끝 줄바꿈을 뗀다", async () => {
    stubStdin("\uFEFF파이프 값\n");
    await expect(readReplaceInputs({ old: "가", new: "-" })).resolves.toEqual({
      oldText: "가",
      newText: "파이프 값",
    });
  });

  it("인자로 준 값은 BOM·끝 줄바꿈을 그대로 둔다", async () => {
    await expect(readReplaceInputs({ old: "\uFEFF줄\n", new: "바뀐 줄\n" })).resolves.toEqual({
      oldText: "\uFEFF줄\n",
      newText: "바뀐 줄\n",
    });
  });

  it("없는 파일은 종료 코드 3", async () => {
    await expectParamError(
      readReplaceInputs({ oldFile: join(dir, "missing.txt"), new: "x" }),
      /파일을 찾을 수 없습니다/,
    );
  });

  it("new 가 빠졌으면 stdin 을 읽기 전에 거부한다", async () => {
    const stdin = stubStdin("버려지면 안 되는 입력");
    await expectParamError(readReplaceInputs({ old: "-" }), /--new 또는 --new-file/);
    expect(stdin).not.toHaveBeenCalled();
  });

  it("new 가 상호배타를 어기면 stdin 을 읽기 전에 거부한다", async () => {
    const stdin = stubStdin("버려지면 안 되는 입력");
    await expectParamError(
      readReplaceInputs({ oldFile: "-", new: "a", newFile: join(dir, "x") }),
      /--new와 --new-file/,
    );
    expect(stdin).not.toHaveBeenCalled();
  });

  it.each([
    ["--old -", { old: "-", new: "나" }, { oldText: "stdin 값", newText: "나" }],
    ["--old-file -", { oldFile: "-", new: "나" }, { oldText: "stdin 값", newText: "나" }],
    ["--new -", { old: "가", new: "-" }, { oldText: "가", newText: "stdin 값" }],
    ["--new-file -", { old: "가", newFile: "-" }, { oldText: "가", newText: "stdin 값" }],
  ])("%s 는 stdin 에서 읽는다", async (_name, opts, expected) => {
    stubStdin("stdin 값");
    await expect(readReplaceInputs(opts)).resolves.toEqual(expected);
  });

  it.each([
    [{ old: "-", new: "-" }],
    [{ oldFile: "-", newFile: "-" }],
    [{ old: "-", newFile: "-" }],
    [{ oldFile: "-", new: "-" }],
  ])("old 와 new 가 함께 stdin 을 쓰면 읽기 전에 거부한다 (%o)", async (opts) => {
    const stdin = stubStdin("x");
    await expectParamError(readReplaceInputs(opts), /stdin/);
    expect(stdin).not.toHaveBeenCalled();
  });

  it("--old 와 --old-file 을 함께 주면 거부한다", async () => {
    await expectParamError(
      readReplaceInputs({ old: "가", oldFile: join(dir, "x"), new: "나" }),
      /--old와 --old-file/,
    );
  });

  it("--new 와 --new-file 을 함께 주면 거부한다", async () => {
    await expectParamError(
      readReplaceInputs({ old: "가", new: "나", newFile: join(dir, "x") }),
      /--new와 --new-file/,
    );
  });

  it("old 가 없으면 거부한다", async () => {
    await expectParamError(readReplaceInputs({ new: "나" }), /--old 또는 --old-file/);
  });

  it("new 가 없으면 거부한다", async () => {
    await expectParamError(readReplaceInputs({ old: "가" }), /--new 또는 --new-file/);
  });

  it("old 가 빈 문자열이면 거부한다", async () => {
    await expectParamError(readReplaceInputs({ old: "", new: "나" }), /비어 있습니다/);
  });

  it("new 는 빈 문자열을 허용한다 (구간 삭제)", async () => {
    await expect(readReplaceInputs({ old: "가", new: "" })).resolves.toEqual({
      oldText: "가",
      newText: "",
    });
  });

  it("old 와 new 가 같으면 거부한다", async () => {
    await expectParamError(readReplaceInputs({ old: "같음", new: "같음" }), /같아/);
  });

  it("--new-file 경로가 빈 문자열이면 구간 삭제로 넘기지 않고 거부한다", async () => {
    await expectParamError(readReplaceInputs({ old: "x", newFile: "" }), /--new-file 경로가 비어 있습니다/);
  });

  it("--new-file 경로가 공백뿐이어도 거부한다", async () => {
    await expectParamError(readReplaceInputs({ old: "x", newFile: "  " }), /--new-file 경로가 비어 있습니다/);
  });

  it("--old-file 경로가 빈 문자열이면 경로가 비었다고 거부한다", async () => {
    await expectParamError(readReplaceInputs({ oldFile: "", new: "y" }), /--old-file 경로가 비어 있습니다/);
  });

  it.each([
    ["0바이트 파일", ""],
    ["줄바꿈 하나만 든 파일", "\n"],
    ["CRLF 하나만 든 파일", "\r\n"],
    ["BOM 만 든 파일", "\uFEFF"],
  ])("--new-file 로 읽은 new 가 비면 구간 삭제로 넘기지 않고 거부한다 (%s)", async (_name, content) => {
    const path = join(dir, "empty-new.md");
    await writeFile(path, content);
    await expectParamError(readReplaceInputs({ old: "x", newFile: path }), /--new-file 로 읽은 new 가 비어 있습니다.*--new ""/);
  });

  it.each([
    ["--new -", { old: "x", new: "-" }],
    ["--new-file -", { old: "x", newFile: "-" }],
  ])("%s 로 읽은 stdin 이 비면 거부한다", async (_name, opts) => {
    stubStdin("");
    await expectParamError(readReplaceInputs(opts), /stdin 으로 읽은 new 가 비어 있습니다.*--new ""/);
  });

  it("stdin 이 줄바꿈 하나뿐이어도 비었다고 보고 거부한다", async () => {
    stubStdin("\n");
    await expectParamError(readReplaceInputs({ old: "x", new: "-" }), /stdin 으로 읽은 new 가 비어 있습니다/);
  });

  it("빈 경로는 stdin 을 읽기 전에 거부한다", async () => {
    const stdin = stubStdin("파이프 입력");
    await expectParamError(readReplaceInputs({ old: "-", newFile: "" }), /--new-file 경로가 비어 있습니다/);
    expect(stdin).not.toHaveBeenCalled();
  });
});

describe("findOccurrences", () => {
  it("겹치는 위치까지 센다", () => {
    expect(findOccurrences("aaa", "aa")).toEqual([0, 1]);
  });

  it("없으면 빈 배열", () => {
    expect(findOccurrences("abc", "x")).toEqual([]);
  });
});

describe("applyReplace", () => {
  it("정확히 한 군데면 그곳만 바꾼다", () => {
    const result = applyReplace("앞\n대상 줄\n뒤", "대상", "바뀐", false);
    expect(result.content).toBe("앞\n바뀐 줄\n뒤");
    expect(result.replaced).toBe(1);
    expect(result.hunks).toEqual([{ line: 2, before: "대상 줄", after: "바뀐 줄" }]);
  });

  it("0건이면 공백·줄바꿈 안내와 함께 거부한다", () => {
    expectThrowParam(() => applyReplace("본문", "없음", "x", false), /공백과 줄바꿈까지/);
  });

  it("공백이 다르면 일치로 보지 않는다", () => {
    expectThrowParam(() => applyReplace("a  b", "a b", "x", false), /찾지 못했습니다/);
  });

  it("2건 이상인데 --all 이 없으면 개수와 함께 거부한다", () => {
    expectThrowParam(() => applyReplace("x y x z x", "x", "w", false), /3군데.*--all/);
  });

  it("겹쳐서 두 군데인 것도 모호하다고 거부한다", () => {
    expectThrowParam(() => applyReplace("aaa", "aa", "b", false), /2군데/);
  });

  it("--all 이면 전부 바꾼다", () => {
    const result = applyReplace("x\ny\nx\nz\nx", "x", "w", true);
    expect(result.content).toBe("w\ny\nw\nz\nw");
    expect(result.replaced).toBe(3);
    expect(result.hunks.map((h) => h.line)).toEqual([1, 3, 5]);
  });

  it("--all 은 겹치는 위치를 건너뛰고 앞에서부터 바꾼다", () => {
    const result = applyReplace("aaaa", "aa", "b", true);
    expect(result.content).toBe("bb");
    expect(result.replaced).toBe(2);
  });

  it("여러 줄 old·new 를 바꾼다", () => {
    const content = "# 제목\n\n- 첫째\n- 둘째\n- 셋째\n\n끝";
    const result = applyReplace(content, "- 첫째\n- 둘째\n", "- 하나\n- 둘\n- 추가\n", false);
    expect(result.content).toBe("# 제목\n\n- 하나\n- 둘\n- 추가\n- 셋째\n\n끝");
    expect(result.hunks[0]?.line).toBe(3);
  });

  it("new 의 $ 문자를 치환 패턴으로 해석하지 않는다", () => {
    const result = applyReplace("가격: X", "X", "$& $1 $$", false);
    expect(result.content).toBe("가격: $& $1 $$");
  });

  it("같은 줄의 여러 위치는 한 구간으로 합친다", () => {
    const result = applyReplace("a x b x c\n다음", "x", "yy", true);
    expect(result.replaced).toBe(2);
    expect(result.hunks).toEqual([{ line: 1, before: "a x b x c", after: "a yy b yy c" }]);
  });

  it("앞 치환으로 길이가 달라져도 뒤 구간의 결과 줄이 맞다", () => {
    const result = applyReplace("x\n중간\nx 끝", "x", "길어진 값", true);
    expect(result.hunks).toEqual([
      { line: 1, before: "x", after: "길어진 값" },
      { line: 3, before: "x 끝", after: "길어진 값 끝" },
    ]);
  });
});

describe("applyReplace 경계", () => {
  it("본문이 \\n 으로 시작하고 위치 0 에서 일치해도 구간이 실제 결과와 같다", () => {
    const result = applyReplace("\nfoo\nbar", "\nfoo", "foo", false);
    expect(result.content).toBe("foo\nbar");
    expect(result.hunks).toEqual([{ line: 1, before: "\nfoo", after: "foo" }]);
  });

  it("위치 0 의 일반 문자 일치", () => {
    const result = applyReplace("foo\nbar", "foo", "baz", false);
    expect(result.hunks).toEqual([{ line: 1, before: "foo", after: "baz" }]);
  });

  it("줄 번호를 구간마다 이어서 센다", () => {
    const content = Array.from({ length: 10 }, (_, i) => `줄${i + 1} x`).join("\n");
    const result = applyReplace(content, "x", "y", true);
    expect(result.hunks.map((h) => h.line)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("CRLF 본문에서 0건이고 old 에 CR 이 없으면 안내를 덧붙인다", () => {
    expectThrowParam(() => applyReplace("첫째\r\n둘째", "첫째\n둘째", "x", false), /CRLF/);
  });

  it("CRLF 본문이어도 old 에 CR 이 있으면 정확 일치로 바꾼다", () => {
    const result = applyReplace("첫째\r\n둘째", "첫째\r\n둘째", "x", false);
    expect(result.content).toBe("x");
  });

  it("정규화하면 일치하는 0건에는 NFC/NFD 안내를 덧붙인다", () => {
    const nfc = "한글 문서";
    const nfd = nfc.normalize("NFD");
    expect(nfd).not.toBe(nfc);
    expectThrowParam(() => applyReplace(`앞 ${nfc} 뒤`, nfd, "x", false), /NFC\/NFD/);
  });

  it("CRLF 안내와 NFC/NFD 안내는 함께 나올 수 있다", () => {
    const old = "한글".normalize("NFD");
    expectThrowParam(() => applyReplace("첫째\r\n한글 문서", old, "x", false), /CRLF[\s\S]*NFC\/NFD|NFC\/NFD[\s\S]*CRLF/);
  });

  it("그냥 없는 문자열의 0건에는 NFC/NFD 안내가 없다", () => {
    let message = "";
    try {
      applyReplace("한글 문서", "없는 말", "x", false);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain("찾지 못했습니다");
    expect(message).not.toContain("NFC");
  });

  it("LF 본문의 0건에는 CRLF 안내가 없다", () => {
    let message = "";
    try {
      applyReplace("첫째\n둘째", "없음", "x", false);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).not.toContain("CRLF");
  });
});

describe("applyReplace 미리보기 구간은 바뀐 줄만 담는다", () => {
  const body = "a\n- 배포\n- 확인\nz";

  it("old·new 가 함께 \\n 으로 끝나면 바뀌지 않는 다음 줄을 넣지 않는다", () => {
    const result = applyReplace(body, "- 배포\n", "- 카나리\n", false);
    expect(result.content).toBe("a\n- 카나리\n- 확인\nz");
    expect(result.hunks).toEqual([{ line: 2, before: "- 배포", after: "- 카나리" }]);
  });

  it("old 만 \\n 으로 끝나 두 줄이 합쳐지면 합쳐진 다음 줄까지 넣는다", () => {
    const result = applyReplace(body, "- 배포\n", "- 카나리", false);
    expect(result.content).toBe("a\n- 카나리- 확인\nz");
    expect(result.hunks).toEqual([{ line: 2, before: "- 배포\n- 확인", after: "- 카나리- 확인" }]);
  });

  it("new 만 \\n 으로 끝나 줄이 갈라지면 결과에 생긴 줄을 넣는다", () => {
    const result = applyReplace(body, "- 배포", "- 카나리\n", false);
    expect(result.content).toBe("a\n- 카나리\n\n- 확인\nz");
    expect(result.hunks).toEqual([{ line: 2, before: "- 배포", after: "- 카나리\n" }]);
  });

  it("old·new 가 함께 \\n 으로 시작하면 바뀌지 않는 앞 줄을 넣지 않는다", () => {
    const result = applyReplace(body, "\n- 배포", "\n- 카나리", false);
    expect(result.hunks).toEqual([{ line: 2, before: "- 배포", after: "- 카나리" }]);
  });

  it("빈 줄 하나를 지우면 지운 빈 줄과 이어지던 줄만 보인다", () => {
    const result = applyReplace("a\nb\n\nc", "\n\n", "\n", false);
    expect(result.content).toBe("a\nb\nc");
    expect(result.hunks).toEqual([{ line: 3, before: "\nc", after: "c" }]);
  });

  it("old 가 \\n 하나뿐이면 합쳐지는 두 줄을 보인다", () => {
    const result = applyReplace("x\ny", "\n", "", false);
    expect(result.content).toBe("xy");
    expect(result.hunks).toEqual([{ line: 1, before: "x\ny", after: "xy" }]);
  });

  it("--all 로 \\n 을 모두 지우면 이어지는 줄을 한 구간으로 합친다", () => {
    const result = applyReplace("a\nb\nc", "\n", "", true);
    expect(result.content).toBe("abc");
    expect(result.replaced).toBe(2);
    expect(result.hunks).toEqual([{ line: 1, before: "a\nb\nc", after: "abc" }]);
  });

  it("--all 에서 줄 끝 \\n 까지 일치해도 인접 줄은 각자의 구간이다", () => {
    const result = applyReplace("p\nq\n- k\n- k\nr", "- k\n", "- m\n", true);
    expect(result.content).toBe("p\nq\n- m\n- m\nr");
    expect(result.hunks).toEqual([
      { line: 3, before: "- k", after: "- m" },
      { line: 4, before: "- k", after: "- m" },
    ]);
  });

  it("--all 에서 같은 줄의 여러 위치와 줄 끝 일치를 함께 합친다", () => {
    const result = applyReplace("x x\nz", "x", "yy", true);
    expect(result.hunks).toEqual([{ line: 1, before: "x x", after: "yy yy" }]);
    const tail = applyReplace("a x\nx\nc", "x\n", "y\n", true);
    expect(tail.content).toBe("a y\ny\nc");
    expect(tail.hunks).toEqual([
      { line: 1, before: "a x", after: "a y" },
      { line: 2, before: "x", after: "y" },
    ]);
  });

  it("본문 끝에서 old 가 끝나도 구간이 맞다", () => {
    expect(applyReplace("a\n- 배포\n", "- 배포\n", "- 카나리\n", false).hunks).toEqual([
      { line: 2, before: "- 배포", after: "- 카나리" },
    ]);
    expect(applyReplace("a\n- 배포", "\n- 배포", "\n- 카나리", false).hunks).toEqual([
      { line: 2, before: "- 배포", after: "- 카나리" },
    ]);
    expect(applyReplace("a\n- 배포\n", "- 배포\n", "", false)).toEqual({
      content: "a\n",
      replaced: 1,
      hunks: [{ line: 2, before: "- 배포\n", after: "" }],
    });
  });

  it("공통 앞부분이 여러 줄이면 바뀐 줄의 번호를 낸다", () => {
    const result = applyReplace("머리\n유지 줄\n바꿀 줄\n꼬리", "유지 줄\n바꿀 줄", "유지 줄\n바뀐 줄", false);
    expect(result.hunks).toEqual([{ line: 3, before: "바꿀 줄", after: "바뀐 줄" }]);
  });
});

describe("applyReplace 구간과 결과 본문의 일치", () => {
  /** 구간의 before 를 원본의 그 줄 머리에서 after 로 바꿔 이어 붙인다. 결과 본문과 같아야 한다. */
  function rebuild(original: string, hunks: { line: number; before: string; after: string }[]): string {
    const lineStarts = [0];
    for (let i = 0; i < original.length; i++) if (original[i] === "\n") lineStarts.push(i + 1);
    let out = "";
    let cursor = 0;
    for (const h of hunks) {
      const at = lineStarts[h.line - 1] as number;
      expect(at).toBeGreaterThanOrEqual(cursor);
      expect(original.startsWith(h.before, at)).toBe(true);
      out += original.slice(cursor, at) + h.after;
      cursor = at + h.before.length;
    }
    return out + original.slice(cursor);
  }

  it("작은 알파벳의 임의 조합에서 구간을 원본에 적용하면 결과 본문이 된다", () => {
    // 재현 가능하도록 고정 시드 LCG 를 쓴다.
    let seed = 42;
    const rand = (n: number): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    const pick = (len: number): string =>
      Array.from({ length: len }, () => "ab\n"[rand(3)]).join("");
    let checked = 0;
    for (let k = 0; k < 3000; k++) {
      const content = pick(1 + rand(12));
      const oldText = pick(1 + rand(4));
      const newText = pick(rand(5));
      if (oldText === newText || !content.includes(oldText)) continue;
      const result = applyReplace(content, oldText, newText, true);
      expect(rebuild(content, result.hunks)).toBe(result.content);
      checked++;
    }
    expect(checked).toBeGreaterThan(500);
  });
});
