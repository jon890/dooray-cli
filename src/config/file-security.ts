/** 설정 파일의 평문 비밀값과 권한을 평가한다. 값과 파일 시스템은 결과에 노출하지 않는다. */
import { SECRET_FIELDS, isStorableSecret, type SecretField } from "./secret-store.js";

export interface ConfigFileSecurityInput {
  platform: NodeJS.Platform;
  mode?: number;
  stored: Partial<Record<SecretField, string>> & { trackLastRun?: boolean };
  hasSecretStore: boolean;
}

export interface ConfigFileSecurityFinding {
  kind: "plaintext-secret" | "plaintext-unstorable" | "wide-permission" | "plaintext-no-store";
  status: "warn" | "fail";
  fields: SecretField[];
  message: string;
  fix?: string;
}

export function assessConfigFileSecurity({
  platform, mode, stored, hasSecretStore,
}: ConfigFileSecurityInput): ConfigFileSecurityFinding[] {
  const fields = SECRET_FIELDS.filter((field) => !!stored[field]);
  if (fields.length === 0) return [];
  const findings: ConfigFileSecurityFinding[] = [];
  const fix = `dooray config set track-last-run ${stored.trackLastRun === true ? "true" : "false"}`;

  if (hasSecretStore) {
    const storable = fields.filter((field) => isStorableSecret(stored[field]!));
    const unstorable = fields.filter((field) => !isStorableSecret(stored[field]!));
    if (storable.length) findings.push({
      kind: "plaintext-secret", status: "fail", fields: storable,
      message: `config.json 에 비밀값(${storable.join(", ")})이 평문으로 저장되어 있습니다.`, fix,
    });
    if (unstorable.length) findings.push({
      kind: "plaintext-unstorable", status: "warn", fields: unstorable,
      message: `config.json 의 비밀값(${unstorable.join(", ")})은 키체인에 옮길 수 없어 평문으로 남아 있습니다. 값을 바꾸면 키체인으로 옮겨집니다.`,
    });
  } else {
    findings.push({
      kind: "plaintext-no-store", status: "warn", fields,
      message: `config.json 에 비밀값(${fields.join(", ")})이 평문으로 저장되어 있습니다. 이 OS 는 암호화 저장소를 아직 지원하지 않습니다.`,
    });
  }
  if (platform !== "win32" && mode !== undefined && (mode & 0o077) !== 0) {
    findings.push({
      kind: "wide-permission", status: "fail", fields,
      message: `비밀값(${fields.join(", ")})이 든 config.json 을 다른 계정이 읽거나 쓸 수 있습니다. 파일 권한을 0600 으로 제한하세요.`, fix,
    });
  }
  return findings;
}
