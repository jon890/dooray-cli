import { describe, expect, it } from "vitest";
import { assessConfigFileSecurity, type ConfigFileSecurityInput } from "./file-security.js";
import { SECRET_FIELDS } from "./secret-store.js";

function assess(overrides: Partial<ConfigFileSecurityInput> = {}) {
  return assessConfigFileSecurity({
    platform: "darwin", mode: 0o600, hasSecretStore: true,
    stored: { apiKey: "dummy-token" }, ...overrides,
  });
}

describe("설정 파일 보안 평가", () => {
  it.each(["darwin", "linux", "win32"] as const)("%s 에서 저장소 유무에 따라 평문 등급을 정한다", (platform) => {
    expect(assess({ platform, hasSecretStore: true })).toMatchObject([
      { kind: "plaintext-secret", status: "fail", fields: ["apiKey"] },
    ]);
    expect(assess({ platform, hasSecretStore: false })).toMatchObject([
      { kind: "plaintext-no-store", status: "warn" },
    ]);
  });

  it.each([0o644, 0o640, 0o601, 0o620, 0o610])("비밀값이 있고 권한 %s 이면 실패다", (mode) => {
    expect(assess({ platform: "linux", mode, hasSecretStore: false })).toContainEqual(
      expect.objectContaining({ kind: "wide-permission", status: "fail" }),
    );
  });

  it.each([0o600, 0o400, undefined])("권한 %s 에는 넓은 권한 경고가 없다", (mode) => {
    expect(assess({ mode }).map((f) => f.kind)).not.toContain("wide-permission");
  });

  it("Windows 에서는 POSIX 권한을 검사하지 않는다", () => {
    expect(assess({ platform: "win32", mode: 0o777, hasSecretStore: false }))
      .toMatchObject([{ kind: "plaintext-no-store", status: "warn" }]);
  });

  it.each([{}, { apiKey: "", imapPassword: "" }, { trackLastRun: true }])("비밀값이 없으면 0644 여도 발견이 없다: %j", (stored) => {
    expect(assess({ mode: 0o644, stored })).toEqual([]);
  });

  it("비ASCII 구버전 값은 경고이고 옮길 수 있는 값은 실패다", () => {
    const result = assess({ stored: { apiKey: "dummy-token", imapPassword: "가짜암호" } });
    expect(result).toMatchObject([
      { kind: "plaintext-secret", status: "fail", fields: ["apiKey"] },
      { kind: "plaintext-unstorable", status: "warn", fields: ["imapPassword"] },
    ]);
    expect(JSON.stringify(result)).not.toContain("dummy-token");
    expect(JSON.stringify(result)).not.toContain("가짜암호");
  });

  it.each(SECRET_FIELDS)("비밀 필드 %s 를 공통 목록에서 평가한다", (field) => {
    expect(assess({ stored: { [field]: "dummy-secret" } })[0].fields).toEqual([field]);
  });

  it.each([true, false, undefined])("고치는 명령은 현재 실행 기록 설정 %s 을 유지한다", (trackLastRun) => {
    expect(assess({ stored: { apiKey: "dummy-token", trackLastRun } })[0].fix)
      .toBe(`dooray config set track-last-run ${trackLastRun === true}`);
  });
});
