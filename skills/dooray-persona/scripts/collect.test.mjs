import { execFile } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const SCRIPTS = fileURLToPath(new URL(".", import.meta.url));
const ME = "member-1";

// 가짜 dooray: 내가 쓴 업무 하나는 정상이고, 댓글 목록 조회가 한도 오류(종료 코드 6)로 끝난다.
const FAKE_DOORAY = `#!/usr/bin/env node
const args = process.argv.slice(2);
const out = (value) => process.stdout.write(JSON.stringify(value) + "\\n");
if (args[0] === "member") out({ id: "${ME}", name: "tester" });
else if (args[0] === "post" && args[1] === "list") {
  out(args.includes("--page") && args[args.indexOf("--page") + 1] !== "0" ? [] : [
    { id: "p1", number: 1, subject: "제목", createdAt: "2026-01-01T00:00:00Z", users: { from: { member: { organizationMemberId: "${ME}" } } } },
  ]);
} else if (args[0] === "post" && args[1] === "get") {
  out({ id: "p1", createdAt: "2026-01-01T00:00:00Z", body: { mimeType: "text/x-markdown", content: "본문 원문" } });
} else {
  process.stderr.write("API 호출 한도를 넘었습니다 (429)\\n");
  process.exit(6);
}
`;

let dir;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "persona-collect-"));
  await writeFile(join(dir, "dooray"), FAKE_DOORAY);
  await chmod(join(dir, "dooray"), 0o755);
  await writeFile(
    join(dir, "config.json"),
    JSON.stringify({
      version: 1,
      targets: [{ projectId: "proj1", code: "demo", name: "예시" }],
      outputPath: join(dir, "persona.md"),
      workDir: join(dir, "work"),
      since: null,
      sessionScan: { enabled: false, roots: [] },
    }),
  );
});
afterEach(() => rm(dir, { recursive: true, force: true }));

function runCollect() {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [join(SCRIPTS, "collect.mjs"), "--config", join(dir, "config.json")],
      { env: { ...process.env, PATH: `${dir}${delimiter}${process.env.PATH}` } },
      (error, stdout, stderr) => resolve({ code: error?.code ?? 0, stdout, stderr }),
    );
  });
}

describe("collect.mjs", () => {
  it("중간에 실패해도 모은 원문을 corpus.partial.jsonl 에 남기고 corpus.jsonl 은 만들지 않는다", async () => {
    const result = await runCollect();

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("corpus.partial.jsonl");
    const partial = await readFile(join(dir, "work", "corpus.partial.jsonl"), "utf8");
    expect(partial.trim().split("\n")).toHaveLength(1);
    expect(JSON.parse(partial.trim())).toMatchObject({ id: "p1#body", text: "본문 원문" });
    await expect(readFile(join(dir, "work", "corpus.jsonl"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("다시 수집해 성공하면 이전 실패의 corpus.partial.jsonl 을 지운다", async () => {
    await runCollect();
    // 두 번째 실행은 댓글이 성공하도록 가짜 CLI 를 바꾼다.
    await writeFile(
      join(dir, "dooray"),
      FAKE_DOORAY.replace("process.exit(6);", "process.stdout.write('[]\\n'); process.exit(0);"),
    );
    const retry = await runCollect();

    expect(retry.code).toBe(0);
    await expect(readFile(join(dir, "work", "corpus.partial.jsonl"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    expect((await readFile(join(dir, "work", "corpus.jsonl"), "utf8")).trim().split("\n")).toHaveLength(1);
  });
});
