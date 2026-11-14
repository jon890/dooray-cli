/** 설정 파일 경로, 검증을 거치는 읽기와 소유자 전용 권한으로 교체하는 쓰기. */
import { readFile, writeFile, mkdir, rename, chmod, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { homedir } from "node:os";
import type { Config } from "@/config/types.js";
import type { ConfigFileReadResult } from "@/config/store-types.js";
import { invalidConfigReason, isStoredConfig, isNodeError, jsonParseReason, reasonOf } from "@/config/store-values.js";
import { DoorayCliError } from "@/utils/errors.js";
import { EXIT_IO_ERROR } from "@/utils/exit-codes.js";

const DOORAY_DIR = join(homedir(), ".dooray");

export const CONFIG_PATH = join(DOORAY_DIR, "config.json");

/**
 * `~/.dooray` 를 소유자 전용으로 둔다.
 *
 * mkdir 의 mode 는 새로 만들 때만 적용되므로 이미 있던 디렉터리는 chmod 로 한 번 맞춘다.
 * chmod 는 Windows 처럼 POSIX 권한이 없는 곳에서 실패할 수 있어 저장을 막지 않는다.
 */
export async function ensureDir(): Promise<void> {
  await mkdir(DOORAY_DIR, { recursive: true, mode: 0o700 });
  try {
    await chmod(DOORAY_DIR, 0o700);
  } catch {
    // POSIX 권한이 없는 파일 시스템이다. 저장은 계속한다.
  }
}

/**
 * config.json 은 비밀 저장소가 없는 OS 에서 평문 apiKey 와 imapPassword 를 담으므로 소유자만 읽게 쓴다.
 *
 * `writeFile` 의 `mode` 는 파일을 새로 만들 때만 적용된다. 그래서 tmp 파일에 쓰고
 * rename 으로 교체한다. rename 은 대상 자리에 tmp 의 inode 를 두므로
 * 이미 0o644 로 있던 config.json 도 저장할 때 0o600 이 된다.
 *
 * tmp 이름에 pid 와 UUID 를 넣고 `wx` 로 열어, 동시에 저장하는 두 프로세스가
 * 같은 tmp 를 덮어쓰거나 남의 tmp 를 rename 하지 않게 한다.
 * 실패하면 tmp 를 지우고 파일 시스템 오류로 알린다.
 */
export async function writeConfigFile(config: Partial<Config>): Promise<void> {
  const tmp = `${CONFIG_PATH}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(tmp, JSON.stringify(config, null, 2) + "\n", {
      mode: 0o600,
      flag: "wx",
    });
    await rename(tmp, CONFIG_PATH);
  } catch (err) {
    await unlink(tmp).catch(() => undefined);
    throw new DoorayCliError(
      `설정 파일을 저장하지 못했습니다: ${CONFIG_PATH}\n이유: ${reasonOf(err)}`,
      EXIT_IO_ERROR,
      { cause: err },
    );
  }
}

/** config.json 을 읽고 검증한다. `apiKey` 가 없어도 통과시킨다. */
export async function readConfigFile(): Promise<ConfigFileReadResult> {
  let parsed: unknown;
  try {
    const raw = await readFile(CONFIG_PATH, "utf-8");
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      return { state: "invalid", reason: jsonParseReason(raw, err) };
    }
  } catch (err) {
    if (isNodeError(err) && err.code === "ENOENT") return { state: "absent" };
    return { state: "unreadable", reason: reasonOf(err) };
  }

  if (!isStoredConfig(parsed)) {
    const invalidReason =
      invalidConfigReason(parsed, { apiKeyOptional: true }) ??
      "설정 파일 형식이 올바르지 않습니다.";
    return { state: "invalid", reason: invalidReason };
  }
  return { state: "ok", stored: parsed };
}
