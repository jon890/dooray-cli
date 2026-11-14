/** 설정 저장 시 비밀값 이전과 저장 실패 시 키체인 복원 (ADR-069). */
import type { Config } from "@/config/types.js";
import type { StoredConfig } from "@/config/store-types.js";
import { CONFIG_PATH, readConfigFile, writeConfigFile } from "@/config/store-file.js";
import { nonEmpty, reasonOf } from "@/config/store-values.js";
import { assertStorableSecret, getSecretStore, isStorableSecret, SECRET_FIELDS, type SecretField, type SecretStore } from "@/config/secret-store.js";
import { DoorayCliError } from "@/utils/errors.js";
import { EXIT_IO_ERROR } from "@/utils/exit-codes.js";

/** 키체인에 반영한 변경 하나다. 되돌릴 때 `previous` 로 맞춘다. 없었으면 `undefined` 다. */
interface AppliedSecretChange {
  field: SecretField;
  previous: string | undefined;
}

/**
 * config 를 저장한다. 비밀 저장소가 있으면 비밀 필드는 그쪽에 두고 파일에서는 뺀다 (ADR-069).
 *
 * 필드마다 지금 저장된 상태와 비교해 바뀐 것만 쓴다.
 * - 새 값이 비었거나 없으면 키체인에 있던 항목을 지운다. `clearMailCredentials` 가 이 경로로 imapPassword 를 지운다.
 * - 새 값이 키체인 값과 같으면 키체인을 건드리지 않는다.
 * - 그 밖에는 키체인에 쓴다. 파일에 있던 구버전 평문을 옮기는 경우도 여기에 든다.
 * 어느 경우든 키체인에 맡긴 필드는 파일에서 뺀다.
 *
 * 사용자가 새로 준 값이 키체인에 저장할 수 없는 문자를 담으면 어느 쪽에도 쓰기 전에 거절한다.
 * 파일에 있던 구버전 값이 그렇다면 거절하지 않고 그 필드만 파일에 남긴 채 경고한다.
 * 그 필드와 무관한 저장까지 막지 않기 위해서다.
 *
 * 키체인에 먼저 쓰고 파일을 쓴다. 뒤 단계가 실패하면 이번에 바꾼 키체인 항목을 이전 값으로 되돌린다.
 * 되돌리기는 best-effort 다. 그것마저 실패하면 원래 오류에 그 사실을 덧붙인다.
 */
export async function writeConfig(config: Config): Promise<void> {
  const secrets = getSecretStore(CONFIG_PATH);
  if (!secrets) {
    await writeConfigFile(config);
    return;
  }

  const prior = await readConfigFile();
  const priorFile: StoredConfig | undefined =
    prior.state === "ok" ? prior.stored : undefined;

  const fileConfig: Partial<Config> = { ...config };
  const plan: { field: SecretField; value: string | undefined }[] = [];
  const keptInFile: SecretField[] = [];

  for (const field of SECRET_FIELDS) {
    // API 방식의 일반 읽기는 쿠키를 가져오지 않는다. 생략은 삭제 요청이 아니다.
    if (field === "sessionCookie" && !(field in config)) continue;
    const value = config[field] || undefined;
    delete fileConfig[field];
    const fileValue = nonEmpty(priorFile?.[field]);
    const migrating = value !== undefined && value === fileValue;

    if (value !== undefined && !isStorableSecret(value)) {
      if (!migrating) assertStorableSecret(field, value);
      // 구버전이 파일에 남긴 값이라 거절하지 않는다. 그대로 파일에 둔다.
      // 같은 필드의 키체인 항목은 지운다. 나중에 파일에서 그 필드를 지우면 낡은 값이 되살아나기 때문이다.
      fileConfig[field] = value;
      keptInFile.push(field);
      plan.push({ field, value: undefined });
      continue;
    }
    plan.push({ field, value });
  }

  const applied: AppliedSecretChange[] = [];
  try {
    for (const { field, value } of plan) {
      const current = await secrets.get(field);
      if (current === value) continue;
      if (value === undefined) await secrets.delete(field);
      else await secrets.set(field, value);
      applied.push({ field, previous: current });
    }
    await writeConfigFile(fileConfig);
  } catch (err) {
    throw await rollbackSecrets(secrets, applied, err);
  }

  for (const field of keptInFile) {
    process.stderr.write(
      `⚠  ${field} 값에 키체인에 저장할 수 없는 문자가 있어 키체인에 옮기지 못하고 config.json 에 남겨 둡니다.\n` +
        "   값을 바꾸면 그때 키체인으로 옮겨집니다.\n",
    );
  }
}

/**
 * 이번 저장에서 바꾼 키체인 항목을 이전 값으로 되돌리고, 던질 오류를 돌려준다.
 *
 * best-effort 다. 되돌리기도 실패하면 키체인 일부가 새 값으로 남을 수 있어 그 사실을 메시지에 덧붙인다.
 * 원래 오류의 종료 코드와 원인은 유지한다.
 */
async function rollbackSecrets(
  secrets: SecretStore,
  applied: AppliedSecretChange[],
  err: unknown,
): Promise<unknown> {
  const failed: SecretField[] = [];
  for (const { field, previous } of [...applied].reverse()) {
    try {
      if (previous === undefined) await secrets.delete(field);
      else await secrets.set(field, previous);
    } catch {
      failed.push(field);
    }
  }
  if (failed.length === 0) return err;
  const fields = failed.join(", ");
  return new DoorayCliError(
    `${reasonOf(err)}\n` +
      `키체인을 이전 값으로 되돌리지 못했습니다. 키체인 일부(${fields})가 새 값으로 남았을 수 있습니다.`,
    err instanceof DoorayCliError ? err.exitCode : EXIT_IO_ERROR,
    { cause: err },
  );
}
