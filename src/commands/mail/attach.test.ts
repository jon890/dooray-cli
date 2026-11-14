import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EXIT_PARAM_ERROR } from "./exit-codes.js";
import { resolveMailAttachments } from "./mail-attach.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "dooray-mail-attach-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("resolveMailAttachments", () => {
  it("옵션이 없으면 빈 목록이다", async () => {
    await expect(resolveMailAttachments(undefined)).resolves.toEqual([]);
  });

  it("파일 이름은 basename 이고 크기를 담는다", async () => {
    const file = join(dir, "사진 1.jpg");
    await writeFile(file, "abcd");
    await expect(resolveMailAttachments([file])).resolves.toEqual([
      { path: file, filename: "사진 1.jpg", size: 4 },
    ]);
  });

  it("없는 파일은 매개변수 오류다", async () => {
    await expect(resolveMailAttachments([join(dir, "none.txt")])).rejects.toMatchObject({
      exitCode: EXIT_PARAM_ERROR,
    });
  });

  it("디렉터리는 매개변수 오류다", async () => {
    const sub = join(dir, "sub");
    await mkdir(sub);
    await expect(resolveMailAttachments([sub])).rejects.toMatchObject({
      exitCode: EXIT_PARAM_ERROR,
    });
  });
});
