/** 관리 저장소의 내용 검증·임시 복사·격리와 저장 실패 시 복원. */
import * as fs from "node:fs/promises";
import path from "node:path";
import { MANIFEST_FILE_NAME, collectSkillContentFiles, computeSkillContentDigest, createDooraySkillManifest, getDigestHex, readDooraySkillManifest, type DooraySkillManifest } from "@/skill/manifest.js";
import type { SkillManagerContext } from "@/skill/types.js";
import { getSource, getStoreRoot, getStorePath, parseStoreBasename } from "@/skill/paths.js";
import { isNodeError, utcTimestamp } from "@/skill/entries.js";
import { DoorayCliError } from "@/utils/errors.js";
import { EXIT_PARAM_ERROR } from "@/utils/exit-codes.js";

async function writeManifest(
  storePath: string,
  manifest: DooraySkillManifest,
): Promise<void> {
  await fs.writeFile(
    path.join(storePath, MANIFEST_FILE_NAME),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
}

async function copySkillContentFiles(source: string, destination: string): Promise<void> {
  for (const relativePath of await collectSkillContentFiles(source)) {
    const sourcePath = path.join(source, relativePath);
    const destinationPath = path.join(destination, ...relativePath.split("/"));
    await fs.mkdir(path.dirname(destinationPath), { recursive: true });
    await fs.copyFile(sourcePath, destinationPath);
  }
}

async function verifyStore(
  storePath: string,
  expectedManifest: DooraySkillManifest,
): Promise<"valid" | "modified" | "corrupt"> {
  const basename = parseStoreBasename(path.basename(storePath));
  if (
    basename == null ||
    basename.packageVersion !== expectedManifest.packageVersion ||
    basename.contentDigest !== expectedManifest.contentDigest
  ) {
    return "corrupt";
  }

  const manifest = await readDooraySkillManifest(
    path.join(storePath, MANIFEST_FILE_NAME),
  );
  if (
    manifest == null ||
    manifest.packageVersion !== expectedManifest.packageVersion ||
    manifest.contentDigest !== expectedManifest.contentDigest
  ) {
    return "corrupt";
  }

  const actualDigest = await computeSkillContentDigest(storePath).catch(() => null);
  if (actualDigest !== expectedManifest.contentDigest) {
    return "modified";
  }

  return "valid";
}

async function createStagedStore(
  context: SkillManagerContext,
  sourceDigest: `sha256:${string}`,
): Promise<string> {
  const storeRoot = getStoreRoot(context);
  const stagingPath = path.join(
    storeRoot,
    `.tmp-${process.pid}-${Date.now()}-${getDigestHex(sourceDigest)}`,
  );
  await fs.mkdir(stagingPath, { recursive: true });

  try {
    await copySkillContentFiles(getSource(context), stagingPath);
    const stagedDigest = await computeSkillContentDigest(stagingPath);
    if (stagedDigest !== sourceDigest) {
      throw new DoorayCliError(
        `스킬 staging 해시가 source 해시와 다릅니다: ${stagedDigest}`,
        1,
      );
    }
    await writeManifest(
      stagingPath,
      createDooraySkillManifest(context.currentVersion, sourceDigest),
    );
    return stagingPath;
  } catch (error) {
    await fs.rm(stagingPath, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

export async function prepareStore(
  context: SkillManagerContext,
  options: { force?: boolean },
): Promise<{ storePath: string; quarantinePath: string | null }> {
  const sourceDigest = await computeSkillContentDigest(getSource(context));
  const expectedManifest = createDooraySkillManifest(
    context.currentVersion,
    sourceDigest,
  );
  const storeRoot = getStoreRoot(context);
  const storePath = getStorePath(context, sourceDigest);

  await fs.mkdir(storeRoot, { recursive: true });

  const existing = await fs
    .lstat(storePath)
    .then((stat) => stat)
    .catch((error: unknown) => {
      if (isNodeError(error, "ENOENT")) {
        return null;
      }
      throw error;
    });

  if (existing != null) {
    if (!existing.isDirectory()) {
      throw new DoorayCliError(
        `관리형 스킬 저장 경로가 디렉터리가 아닙니다: ${storePath}`,
        EXIT_PARAM_ERROR,
      );
    }

    const status = await verifyStore(storePath, expectedManifest);
    if (status === "valid") {
      return { storePath, quarantinePath: null };
    }

    if (options.force !== true) {
      throw new DoorayCliError(
        `관리형 스킬 저장소가 ${status} 상태입니다: ${storePath}`,
        EXIT_PARAM_ERROR,
      );
    }
  }

  const stagingPath = await createStagedStore(context, sourceDigest);
  let quarantinePath: string | null = null;

  try {
    if (existing != null) {
      quarantinePath = path.join(
        storeRoot,
        `.backup-${utcTimestamp()}-${path.basename(storePath)}`,
      );
      await fs.rename(storePath, quarantinePath);
    }

    await fs.rename(stagingPath, storePath);
    return { storePath, quarantinePath };
  } catch (error) {
    await fs.rm(stagingPath, { recursive: true, force: true }).catch(() => {});
    if (quarantinePath != null) {
      await fs.rename(quarantinePath, storePath).catch(() => {});
    }
    throw error;
  }
}
