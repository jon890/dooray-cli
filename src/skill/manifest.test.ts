import { afterEach, describe, expect, it } from "vitest";
import * as fs from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  MANIFEST_FILE_NAME,
  computeSkillContentDigest,
  createDooraySkillManifest,
  isDooraySkillManifest,
  readDooraySkillManifest,
} from "./manifest.js";
import { DoorayCliError } from "../utils/errors.js";

const roots: string[] = [];
const FIXED_SINGLE_FILE_DIGEST =
  "sha256:08e0debf0cef258268d30f0dc47b217a4088f1e6a9c1125c3b0849662448dcee";

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

async function makeRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(tmpdir(), "dooray-manifest-test-"));
  roots.push(root);
  return root;
}

async function writeSkill(
  root: string,
  entries: Array<[relativePath: string, content: string]>,
): Promise<void> {
  for (const [relativePath, content] of entries) {
    const filePath = path.join(root, ...relativePath.split("/"));
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content);
  }
}

describe("Dooray skill manifest", () => {
  it("validates the external JSON shape without type assertions", async () => {
    const manifest = createDooraySkillManifest(
      "1.2.3",
      FIXED_SINGLE_FILE_DIGEST,
      "2026-07-23T00:00:00.000Z",
    );

    expect(isDooraySkillManifest(manifest)).toBe(true);
    expect(isDooraySkillManifest({ ...manifest, skillVersion: "1.0.0" })).toBe(
      true,
    );
    expect(isDooraySkillManifest({ ...manifest, schemaVersion: 2 })).toBe(false);
    expect(isDooraySkillManifest({ ...manifest, contentDigest: "sha256:ABC" }))
      .toBe(false);
    expect(isDooraySkillManifest({ ...manifest, installedAt: "2026-07-23" }))
      .toBe(false);
    expect(isDooraySkillManifest({
      ...manifest,
      installedAt: "2026-07-23T00:00:00Z",
    })).toBe(false);
    expect(isDooraySkillManifest({
      ...manifest,
      installedAt: "2026-02-30T00:00:00.000Z",
    })).toBe(false);
    expect(() =>
      isDooraySkillManifest({
        ...manifest,
        installedAt: "2026-99-99T00:00:00.000Z",
      }),
    ).not.toThrow();
    expect(isDooraySkillManifest({
      ...manifest,
      installedAt: "2026-99-99T00:00:00.000Z",
    })).toBe(false);
    expect(isDooraySkillManifest({ ...manifest, managedBy: "someone-else" }))
      .toBe(false);
  });

  it("returns null for invalid JSON, missing fields, and invalid digest", async () => {
    const root = await makeRoot();
    const manifestPath = path.join(root, MANIFEST_FILE_NAME);

    await fs.writeFile(manifestPath, "{");
    await expect(readDooraySkillManifest(manifestPath)).resolves.toBeNull();

    await fs.writeFile(manifestPath, JSON.stringify({ schemaVersion: 1 }));
    await expect(readDooraySkillManifest(manifestPath)).resolves.toBeNull();

    await fs.writeFile(
      manifestPath,
      JSON.stringify(
        {
          ...createDooraySkillManifest("1.2.3", FIXED_SINGLE_FILE_DIGEST),
          contentDigest: "sha256:not-a-digest",
        },
      ),
    );
    await expect(readDooraySkillManifest(manifestPath)).resolves.toBeNull();

    await fs.writeFile(
      manifestPath,
      JSON.stringify({
        ...createDooraySkillManifest("1.2.3", FIXED_SINGLE_FILE_DIGEST),
        installedAt: "2026-07-23",
      }),
    );
    await expect(readDooraySkillManifest(manifestPath)).resolves.toBeNull();

    await fs.writeFile(
      manifestPath,
      JSON.stringify({
        ...createDooraySkillManifest("1.2.3", FIXED_SINGLE_FILE_DIGEST),
        installedAt: "2026-99-99T00:00:00.000Z",
      }),
    );
    await expect(readDooraySkillManifest(manifestPath)).resolves.toBeNull();
  });
});

describe("computeSkillContentDigest", () => {
  it("matches the fixed single-file fixture digest", async () => {
    const root = await makeRoot();
    await writeSkill(root, [["SKILL.md", "# dooray-cli\n"]]);

    await expect(computeSkillContentDigest(root)).resolves.toBe(
      FIXED_SINGLE_FILE_DIGEST,
    );
  });

  it("is stable across file creation order using code-point path sort", async () => {
    const left = await makeRoot();
    const right = await makeRoot();
    const entries: Array<[string, string]> = [
      ["SKILL.md", "# skill\n"],
      ["references/😀.md", "emoji\n"],
      ["references/a.md", "a\n"],
      ["references/é.md", "accent\n"],
    ];

    await writeSkill(left, entries);
    await writeSkill(right, [...entries].reverse());

    await expect(computeSkillContentDigest(left)).resolves.toBe(
      await computeSkillContentDigest(right),
    );
  });

  it("changes when a path or byte changes", async () => {
    const base = await makeRoot();
    const changedPath = await makeRoot();
    const changedByte = await makeRoot();

    await writeSkill(base, [
      ["SKILL.md", "# skill\n"],
      ["references/a.md", "same\n"],
    ]);
    await writeSkill(changedPath, [
      ["SKILL.md", "# skill\n"],
      ["references/b.md", "same\n"],
    ]);
    await writeSkill(changedByte, [
      ["SKILL.md", "# skill\n"],
      ["references/a.md", "different\n"],
    ]);

    const baseDigest = await computeSkillContentDigest(base);
    await expect(computeSkillContentDigest(changedPath)).resolves.not.toBe(
      baseDigest,
    );
    await expect(computeSkillContentDigest(changedByte)).resolves.not.toBe(
      baseDigest,
    );
  });

  it("excludes the manifest file from the digest", async () => {
    const root = await makeRoot();
    await writeSkill(root, [["SKILL.md", "# skill\n"]]);
    const before = await computeSkillContentDigest(root);
    await fs.writeFile(path.join(root, MANIFEST_FILE_NAME), "not included\n");

    await expect(computeSkillContentDigest(root)).resolves.toBe(before);
  });

  it("rejects symlinks and non-regular files", async () => {
    const symlinkRoot = await makeRoot();
    await writeSkill(symlinkRoot, [["SKILL.md", "# skill\n"]]);
    await fs.mkdir(path.join(symlinkRoot, "references"));
    await fs.symlink("SKILL.md", path.join(symlinkRoot, "references", "link.md"));

    await expect(computeSkillContentDigest(symlinkRoot)).rejects.toBeInstanceOf(
      DoorayCliError,
    );

    const fifoRoot = await makeRoot();
    await writeSkill(fifoRoot, [["SKILL.md", "# skill\n"]]);
    await fs.mkdir(path.join(fifoRoot, "references"));
    execFileSync("mkfifo", [path.join(fifoRoot, "references", "pipe.md")]);

    await expect(computeSkillContentDigest(fifoRoot)).rejects.toBeInstanceOf(
      DoorayCliError,
    );
  });

  it("rejects a references root symlink before traversal", async () => {
    const root = await makeRoot();
    const external = await makeRoot();
    await writeSkill(root, [["SKILL.md", "# skill\n"]]);
    await fs.mkdir(path.join(external, "references"));
    await fs.writeFile(path.join(external, "references", "a.md"), "external\n");
    await fs.symlink(
      path.join(external, "references"),
      path.join(root, "references"),
    );

    await expect(computeSkillContentDigest(root)).rejects.toBeInstanceOf(
      DoorayCliError,
    );
  });
});
