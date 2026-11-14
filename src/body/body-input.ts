import { readFile } from "node:fs/promises";
import { DoorayCliError } from "./errors.js";
import { EXIT_PARAM_ERROR } from "./exit-codes.js";

export interface BodyInputOptions {
  body?: string;
  bodyFile?: string;
}

/** 두레이 본문 mimeType — API 값 그대로 사용한다 (별칭 매핑 없음). */
export const MARKDOWN_MIME = "text/x-markdown";
export const HTML_MIME = "text/html";

/** `--mime-type` 옵션이 받는 값 목록. */
export const BODY_MIME_TYPES = [MARKDOWN_MIME, HTML_MIME];

/**
 * 수정 요청에 실을 본문 mimeType 을 고른다.
 *
 * - `override`(`--mime-type`)가 있으면 그 값
 * - 없으면 기존 글의 mimeType 보존
 * - 기존 값이 없거나 빈 문자열이면 markdown 폴백
 *
 * 빈 문자열을 폴백으로 넘기는 이유는, 그대로 채택하면 `mimeType: ""` 이
 * 요청에 실려 나가기 때문이다. 타입상 `mimeType` 은 필수 `string` 이라
 * 이 폴백이 발동하는 것은 응답이 타입 선언과 어긋났다는 뜻이다.
 */
export function resolveBodyMimeType(
  existing: string | undefined,
  override?: string,
): string {
  return override ?? (existing || undefined) ?? MARKDOWN_MIME;
}

/**
 * 본문은 그대로인데 `--mime-type` 이 형식만 바꾸는 경우 stderr 로 알린다.
 *
 * CLI 는 본문을 변환하지 않는다. 마크다운 본문을 `text/html` 로만 바꾸면
 * 웹에서 `## 제목` 과 표 구분자가 문자 그대로 보인다.
 * 형식만 되돌리려는 의도일 수도 있어 막지 않고 알리기만 한다.
 */
export function warnUnconvertedBody(
  existing: string | undefined,
  override: string | undefined,
  bodyChanged: boolean,
): void {
  if (override == null || bodyChanged) return;
  if (resolveBodyMimeType(existing) === override) return;
  process.stderr.write(
    `⚠  본문은 그대로 두고 형식만 ${override} 으로 바꿉니다. CLI 는 본문을 변환하지 않으므로 내용이 새 형식에 맞지 않으면 렌더링이 깨집니다.\n`,
  );
}

export interface TextInputSource {
  /** 인자로 받은 값 (`--body` 등). `-` 면 stdin */
  text?: string;
  /** 파일 경로 (`--body-file` 등). `-` 면 stdin */
  file?: string;
  /** 오류 메시지에 쓸 옵션 이름 (`--body`) */
  textFlag: string;
  /** 오류 메시지에 쓸 옵션 이름 (`--body-file`) */
  fileFlag: string;
}

export interface TextInputBehavior {
  /**
   * 파일과 stdin 으로 받은 값에서 UTF-8 BOM 과 끝 줄바꿈 하나를 뗀다. 인자로 받은 값은 손대지 않는다.
   * 정확 일치로 찾는 입력(`replace` 의 old/new)에 쓴다. 에디터와 `echo` 가 붙인 끝 줄바꿈 때문에
   * 뜻과 다르게 일치하거나 0건이 되는 것을 막는다 (ADR-065).
   */
  stripFileArtifacts?: boolean;
  /** 없는 파일을 raw ENOENT 대신 `EXIT_PARAM_ERROR` 로 알린다. */
  missingFileAsParamError?: boolean;
}

/** UTF-8 BOM 과 끝 줄바꿈(`\n` 또는 `\r\n`) 하나를 뗀다. */
export function stripFileArtifacts(text: string): string {
  return text.replace(/^\uFEFF/, "").replace(/\r?\n$/, "");
}

async function readFileInput(path: string, behavior: TextInputBehavior): Promise<string> {
  try {
    return await readFile(path, "utf-8");
  } catch (e) {
    if (behavior.missingFileAsParamError && (e as NodeJS.ErrnoException).code === "ENOENT") {
      throw new DoorayCliError(`파일을 찾을 수 없습니다: ${path}`, EXIT_PARAM_ERROR);
    }
    throw e;
  }
}

/**
 * 인자 하나와 파일 하나로 받는 텍스트 입력을 읽는다. `--body`/`--body-file` 과 `replace` 의
 * `--old`/`--old-file`·`--new`/`--new-file` 이 같이 쓴다.
 *
 * - 둘 다 주면 에러
 * - 값이 `"-"` 이면 stdin 에서 읽는다
 * - 둘 다 비어 있으면 빈 문자열 (호출자가 의미를 정한다)
 */
export async function readTextInput(
  source: TextInputSource,
  behavior: TextInputBehavior = {},
): Promise<string> {
  const { text, file, textFlag, fileFlag } = source;
  if (text != null && file != null) {
    throw new DoorayCliError(
      `${textFlag}와 ${fileFlag}은 함께 사용할 수 없습니다.`,
      EXIT_PARAM_ERROR,
    );
  }
  const clean = (raw: string): string =>
    behavior.stripFileArtifacts ? stripFileArtifacts(raw) : raw;
  if (file) {
    if (file === "-") return clean(await readStdin());
    return clean(await readFileInput(file, behavior));
  }
  if (text === "-") return clean(await readStdin());
  return text ?? "";
}

/**
 * `--body` / `--body-file` 옵션을 받아 본문 문자열을 돌려준다.
 *
 * - 둘 중 하나만 지정 가능. 동시 지정 시 에러.
 * - 값이 `"-"`이면 stdin에서 읽음.
 * - 둘 다 비어있으면 빈 문자열 반환 (호출자 책임으로 의미 해석).
 */
export async function readBodyInput(opts: BodyInputOptions): Promise<string> {
  return readTextInput({
    text: opts.body,
    file: opts.bodyFile,
    textFlag: "--body",
    fileFlag: "--body-file",
  });
}

/**
 * `readBodyInput`의 null-friendly variant.
 *
 * - body/bodyFile 둘 다 미지정 시 `null` 반환 (호출자가 "본문 유지" / "$EDITOR 폴백" 등으로 해석)
 * - 동시 지정 시 에러 (`readBodyInput`과 동일)
 * - 하나만 지정 시 해당 값 반환 (`readBodyInput`과 동일)
 */
export async function readBodyInputOrNull(
  opts: BodyInputOptions,
): Promise<string | null> {
  if (opts.body == null && opts.bodyFile == null) return null;
  return readBodyInput(opts);
}

export async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    throw new DoorayCliError(
      "stdin에서 읽으려면 파이프로 데이터를 전달해주세요.",
      EXIT_PARAM_ERROR,
    );
  }
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf-8");
}
