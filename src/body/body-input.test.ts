import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import {
  readBodyInput,
  readBodyInputOrNull,
  resolveBodyMimeType,
  warnUnconvertedBody,
  MARKDOWN_MIME,
  HTML_MIME,
  BODY_MIME_TYPES,
} from "./body-input.js";
import { DoorayCliError } from "./errors.js";
import { EXIT_PARAM_ERROR } from "./exit-codes.js";

describe("resolveBodyMimeType", () => {
  it("override 가 있으면 기존 값보다 우선한다", () => {
    expect(resolveBodyMimeType(HTML_MIME, MARKDOWN_MIME)).toBe(MARKDOWN_MIME);
    expect(resolveBodyMimeType(MARKDOWN_MIME, HTML_MIME)).toBe(HTML_MIME);
  });

  it("override 가 없으면 기존 값을 보존한다", () => {
    expect(resolveBodyMimeType(HTML_MIME)).toBe(HTML_MIME);
    expect(resolveBodyMimeType(MARKDOWN_MIME)).toBe(MARKDOWN_MIME);
  });

  it("기존 값이 undefined 면 markdown 으로 폴백한다", () => {
    expect(resolveBodyMimeType(undefined)).toBe(MARKDOWN_MIME);
  });

  it("기존 값이 빈 문자열이어도 markdown 으로 폴백한다", () => {
    expect(resolveBodyMimeType("")).toBe(MARKDOWN_MIME);
  });

  it("기존 값이 빈 문자열이어도 override 는 그대로 채택한다", () => {
    expect(resolveBodyMimeType("", HTML_MIME)).toBe(HTML_MIME);
  });
});

describe("warnUnconvertedBody", () => {
  function captureStderr() {
    let output = "";
    const spy = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      output += String(chunk);
      return true;
    });
    return { spy, read: () => output };
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("본문을 바꾸지 않고 형식만 바꾸면 경고한다", () => {
    const stderr = captureStderr();
    warnUnconvertedBody(MARKDOWN_MIME, HTML_MIME, false);
    expect(stderr.read()).toContain(HTML_MIME);
    expect(stderr.read()).toContain("본문을 변환하지 않으므로");
  });

  it("본문을 함께 바꾸면 경고하지 않는다", () => {
    const stderr = captureStderr();
    warnUnconvertedBody(MARKDOWN_MIME, HTML_MIME, true);
    expect(stderr.read()).toBe("");
  });

  it("--mime-type 이 없으면 경고하지 않는다", () => {
    const stderr = captureStderr();
    warnUnconvertedBody(MARKDOWN_MIME, undefined, false);
    expect(stderr.read()).toBe("");
  });

  it("지정한 값이 기존 형식과 같으면 경고하지 않는다", () => {
    const stderr = captureStderr();
    warnUnconvertedBody(HTML_MIME, HTML_MIME, false);
    expect(stderr.read()).toBe("");
  });

  it("기존 값이 없을 때 markdown 을 지정하면 경고하지 않는다", () => {
    const stderr = captureStderr();
    warnUnconvertedBody(undefined, MARKDOWN_MIME, false);
    expect(stderr.read()).toBe("");
  });
});

describe("BODY_MIME_TYPES", () => {
  it("markdown 과 html 두 값을 받는다", () => {
    expect(BODY_MIME_TYPES).toEqual([MARKDOWN_MIME, HTML_MIME]);
  });
});

/**
 * `--body`/`--body-file` 은 `replace` 의 old·new 와 같은 `readTextInput` 을 쓰지만 BOM·끝 줄바꿈을 떼지 않고
 * 없는 파일도 raw 오류 그대로 낸다. `post create`·`wiki page create`·`mail send` 등의 본문이 달라지지 않게 고정한다 (ADR-065).
 */
describe("readBodyInput 의 종전 동작", () => {
  let dir: string;

  function stubStdin(data: string) {
    const stream = Readable.from([Buffer.from(data)]) as Readable & { isTTY?: boolean };
    stream.isTTY = false;
    return vi.spyOn(process, "stdin", "get").mockReturnValue(stream as unknown as typeof process.stdin);
  }

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "body-input-"));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(dir, { recursive: true, force: true });
  });

  it("--body-file 은 BOM 과 끝 줄바꿈을 그대로 둔다", async () => {
    const path = join(dir, "body.md");
    await writeFile(path, "\uFEFF# 제목\n\n본문\n");
    await expect(readBodyInput({ bodyFile: path })).resolves.toBe("\uFEFF# 제목\n\n본문\n");
  });

  it("--body-file 은 CRLF 끝 줄바꿈도 그대로 둔다", async () => {
    const path = join(dir, "body.md");
    await writeFile(path, "본문\r\n");
    await expect(readBodyInput({ bodyFile: path })).resolves.toBe("본문\r\n");
  });

  it("--body - 는 stdin 의 끝 줄바꿈을 그대로 둔다", async () => {
    stubStdin("\uFEFF파이프 본문\n");
    await expect(readBodyInput({ body: "-" })).resolves.toBe("\uFEFF파이프 본문\n");
  });

  it("--body-file - 는 stdin 의 끝 줄바꿈을 그대로 둔다", async () => {
    stubStdin("파이프 본문\n\n");
    await expect(readBodyInput({ bodyFile: "-" })).resolves.toBe("파이프 본문\n\n");
  });

  it("--body 인자는 그대로 쓴다", async () => {
    await expect(readBodyInput({ body: "인자 본문\n" })).resolves.toBe("인자 본문\n");
  });

  it("없는 --body-file 은 DoorayCliError 로 바꾸지 않고 raw ENOENT 를 낸다", async () => {
    const err = await readBodyInput({ bodyFile: join(dir, "missing.md") }).then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(DoorayCliError);
    expect((err as NodeJS.ErrnoException).code).toBe("ENOENT");
  });

  it("--body 와 --body-file 을 함께 주면 종료 코드 3", async () => {
    const err = await readBodyInput({ body: "a", bodyFile: join(dir, "x.md") }).then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(DoorayCliError);
    expect((err as DoorayCliError).exitCode).toBe(EXIT_PARAM_ERROR);
    expect((err as Error).message).toMatch(/--body와 --body-file/);
  });

  it("readBodyInputOrNull 도 같은 규칙으로 읽고, 둘 다 없으면 null", async () => {
    const path = join(dir, "body.md");
    await writeFile(path, "본문\n");
    await expect(readBodyInputOrNull({ bodyFile: path })).resolves.toBe("본문\n");
    await expect(readBodyInputOrNull({})).resolves.toBeNull();
  });
});
