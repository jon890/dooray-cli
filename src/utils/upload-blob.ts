import { extname } from "node:path";

const MIME_TYPES = new Map([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".gif", "image/gif"],
  [".webp", "image/webp"],
  [".svg", "image/svg+xml"],
  [".bmp", "image/bmp"],
  [".avif", "image/avif"],
  [".pdf", "application/pdf"],
  [".txt", "text/plain"],
  [".csv", "text/csv"],
  [".json", "application/json"],
  [".zip", "application/zip"],
]);

/** 업무·위키 업로드의 multipart 파일에 확장자 기준 MIME 형식을 붙인다. */
export function uploadBlob(buffer: Uint8Array<ArrayBuffer>, fileName: string): Blob {
  const type = MIME_TYPES.get(extname(fileName).toLowerCase()) ?? "application/octet-stream";
  return new Blob([buffer], { type });
}
