// 메일 첨부의 저장 이름을 정한다 (ADR-071). 파일 시스템에 의존하지 않는 순수 함수다.
import { sanitizeFileName } from "./content-disposition.js";

const MAX_FILE_NAME_BYTES = 255;

function nameKey(name: string): string {
  return name.normalize("NFC").toLowerCase();
}

// 확장자는 마지막 `.` 이후다. `.env` 처럼 `.` 으로 시작하거나 `.` 이 없는 이름은 확장자가 없다.
function splitExtension(name: string): { stem: string; ext: string } {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return { stem: name, ext: "" };
  return { stem: name.slice(0, dot), ext: name.slice(dot) };
}

function fits(name: string): boolean {
  return Buffer.byteLength(name, "utf-8") <= MAX_FILE_NAME_BYTES;
}

// 같은 메일의 첨부끼리 같은 이름이 되지 않게 한다. --force 로 서로 덮어쓰는 일을 막으려는 것이다.
// 대소문자만 다른 이름도 같은 이름으로 본다 (macOS 기본 파일 시스템).
export function assignAttachmentFileNames(
  items: ReadonlyArray<{ index: number; filename: string | undefined }>,
): Map<number, string> {
  const result = new Map<number, string>();
  const used = new Set<string>();
  const ordered = [...items].sort((a, b) => a.index - b.index);

  for (const { index, filename } of ordered) {
    const base = (filename ? sanitizeFileName(filename) : null) ?? `attachment-${index}`;
    let name = base;
    if (used.has(nameKey(name))) {
      const { stem, ext } = splitExtension(base);
      name = `${stem}-${index}${ext}`;
      if (!fits(name)) name = `attachment-${index}`;
      for (let n = 2; used.has(nameKey(name)); n++) {
        name = `${stem}-${index}-${n}${ext}`;
        if (!fits(name)) name = `attachment-${index}-${n}`;
      }
    }
    used.add(nameKey(name));
    result.set(index, name);
  }
  return result;
}
