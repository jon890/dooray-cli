/** 파일 오류·링크 대상·패키지 정보 확인과 백업 시각 작성. */
import * as fs from "node:fs/promises";
import path from "node:path";

interface PackageMetadata {
  name: string;
  version: string;
}

export function isNodeError(error: unknown, code: string): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as { code: unknown }).code === code
  );
}

function isPackageMetadata(value: unknown): value is PackageMetadata {
  return (
    value != null &&
    typeof value === "object" &&
    "name" in value &&
    "version" in value &&
    typeof value.name === "string" &&
    typeof value.version === "string"
  );
}

export async function readPackageMetadata(
  skillPath: string,
): Promise<PackageMetadata | null> {
  const packageJsonPath = path.join(skillPath, "..", "..", "package.json");

  try {
    const parsed: unknown = JSON.parse(
      await fs.readFile(packageJsonPath, "utf8"),
    );
    if (!isPackageMetadata(parsed)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function resolveLinkTarget(destination: string, linkTarget: string): string {
  return path.resolve(path.dirname(destination), linkTarget);
}

export async function isSameEntry(left: string, right: string): Promise<boolean> {
  try {
    const [leftRealPath, rightRealPath] = await Promise.all([
      fs.realpath(left),
      fs.realpath(right),
    ]);
    return leftRealPath === rightRealPath;
  } catch {
    return path.resolve(left) === path.resolve(right);
  }
}

export function utcTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}
