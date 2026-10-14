/**
 * config 의 비밀 필드(`apiKey`, `imapPassword`)를 OS 비밀 저장소에 두는 경계다 (ADR-069).
 *
 * 지금은 macOS 로그인 키체인 하나만 있다. 다른 OS 는 `getSecretStore` 가 `null` 을 돌려주고,
 * `store.ts` 는 그때 예전처럼 config.json 에 평문으로 저장한다.
 * Linux·Windows 백엔드는 `SecretStore` 를 구현해 `getSecretStore` 에 더하면 된다.
 *
 * 키체인은 네이티브 모듈 없이 `/usr/bin/security` 를 띄워 다룬다.
 * 비밀값이 argv 와 오류 메시지에 들어가지 않게 하는 것이 이 파일의 가장 중요한 불변식이다.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { userInfo } from "node:os";
import { join, resolve } from "node:path";
import { DoorayCliError } from "../utils/errors.js";
import { EXIT_CONFIG_ERROR, EXIT_PARAM_ERROR } from "../utils/exit-codes.js";

export const SECRET_FIELDS = ["apiKey", "imapPassword"] as const;
export type SecretField = (typeof SECRET_FIELDS)[number];

export interface SecretStore {
  /** 저장된 값이 없으면 `undefined` 다. 저장소에 접근하지 못하면 던진다. */
  get(name: SecretField): Promise<string | undefined>;
  set(name: SecretField, value: string): Promise<void>;
  /** 없는 항목을 지우는 것은 성공으로 본다. */
  delete(name: SecretField): Promise<void>;
}

const SECURITY_PATH = "/usr/bin/security";
const KEYCHAIN_SERVICE = "dooray-cli";
/** `security` 가 「항목 없음」 에 돌려주는 종료 코드다 (errSecItemNotFound). */
const EXIT_ITEM_NOT_FOUND = 44;

/** `-i` 로 넘기는 명령 한 줄이 깨지지 않고, `-w` 출력이 hex 로 바뀌지 않는 범위다. */
const PRINTABLE_ASCII = /^[\x20-\x7e]*$/;

/**
 * 키체인에 저장할 수 있는 값인지 확인한다. 값은 메시지에 넣지 않는다.
 *
 * `find-generic-password -w` 는 출력할 수 없는 바이트가 있는 값을 hex 로 내보내
 * 원문과 구별할 수 없다. 줄바꿈은 `security -i` 의 명령 한 줄을 끊는다.
 */
export function isStorableSecret(value: string): boolean {
  return PRINTABLE_ASCII.test(value);
}

export function assertStorableSecret(name: SecretField, value: string): void {
  if (!isStorableSecret(value)) {
    throw new DoorayCliError(
      `${name} 값에 키체인에 저장할 수 없는 문자가 있습니다.\n` +
        "영문·숫자·기호와 공백(출력 가능한 ASCII)만 쓸 수 있습니다. 줄바꿈·탭·한글은 넣을 수 없습니다.",
      EXIT_PARAM_ERROR,
    );
  }
}

/**
 * 키체인 항목의 account 를 정한다.
 *
 * config 경로가 계정 홈의 기본 경로(`~/.dooray/config.json`)면 필드 이름 그대로다.
 * `HOME` 을 바꿔 다른 경로의 config 를 쓰면 `<field>:<경로 sha256 앞 16자>` 로 나눈다.
 * 그렇지 않으면 여러 Dooray 계정이 같은 항목을 공유해 서로의 토큰을 덮는다.
 *
 * 경로를 그대로 넣지 않고 해시하는 이유는 공백·따옴표·한글이 든 경로가
 * `security -i` 명령 줄에서 어떻게 인용·인코딩되는지 확인하지 않았기 때문이다. 해시는 ASCII 다.
 * 경로는 `path.resolve` 로만 정규화하고 심볼릭 링크는 풀지 않는다.
 */
export function keychainAccount(field: SecretField, configPath: string): string {
  const resolved = resolve(configPath);
  const defaultPath = resolve(join(userInfo().homedir, ".dooray", "config.json"));
  if (resolved === defaultPath) return field;
  const hash = createHash("sha256").update(resolved).digest("hex").slice(0, 16);
  return `${field}:${hash}`;
}

interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

/**
 * `security` 에 넘길 환경이다. `HOME` 만 계정의 실제 홈으로 바꾼다.
 *
 * `security` 는 로그인 키체인을 `$HOME/Library/Keychains` 에서 찾는다.
 * `HOME` 이 다른 경로면 키체인을 찾지 못하고, 쓰기에서는 macOS 가 「기본값으로 재설정」
 * 대화상자를 띄운다. 그 버튼은 실제 로그인 키체인을 초기화할 수 있다.
 * 키체인은 `$HOME` 이 아니라 사용자 계정에 속하므로 계정 정보의 홈을 쓴다.
 */
export function securityEnv(): NodeJS.ProcessEnv {
  return { ...process.env, HOME: userInfo().homedir };
}

/** shell 없이 절대경로로 `security` 를 띄운다. `input` 은 stdin 으로만 넘긴다. */
function runSecurity(args: string[], input?: string): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(SECURITY_PATH, args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: securityEnv(),
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    // 프로세스가 먼저 끝나면 stdin 쓰기가 EPIPE 로 실패한다. 결과는 종료 코드로 판정한다.
    child.stdin.on("error", () => undefined);
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    if (input !== undefined) child.stdin.write(input);
    child.stdin.end();
  });
}

/** `security -i` 의 큰따옴표 인자 안에서 `\` 와 `"` 만 이스케이프하면 원문이 그대로 복원된다. */
function quoteForInteractive(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** stderr 에 혹시 비밀값이 섞여 나와도 메시지로 옮기지 않는다. */
function redact(text: string, secret?: string): string {
  if (!secret) return text.trim();
  return text
    .split(secret)
    .join("***")
    .split(quoteForInteractive(secret))
    .join("***")
    .trim();
}

function keychainError(
  action: string,
  name: SecretField,
  detail: string,
  cause?: unknown,
): DoorayCliError {
  return new DoorayCliError(
    `macOS 키체인에서 ${name} 를 ${action} 못했습니다.\n` +
      `이유: ${detail || "알 수 없음"}\n` +
      "로그인 키체인이 잠겨 있거나 접근이 거부됐을 수 있습니다. 접근 허용을 묻는 창이 떴다면 승인한 뒤 다시 실행하세요.\n" +
      "SSH 같은 원격·비대화형 세션이면 `security unlock-keychain` 으로 로그인 키체인의 잠금을 푼 뒤 다시 실행하세요.\n" +
      "계속 실패하면 키체인 접근 앱에서 이름이 `dooray-cli` 인 항목을 지우고 `dooray setup` 을 다시 실행하세요.",
    EXIT_CONFIG_ERROR,
    cause === undefined ? undefined : { cause },
  );
}

function failureDetail(result: RunResult, secret?: string): string {
  const stderr = redact(result.stderr, secret);
  return stderr || `security 종료 코드 ${result.code}`;
}

/**
 * macOS 로그인 키체인 구현이다. service 는 `dooray-cli`, account 는 `accountFor` 가 정한다.
 * 기본은 필드 이름이다. `getSecretStore` 는 `keychainAccount` 로 config 경로별 account 를 넘긴다.
 *
 * 한 프로세스 안에서 `getConfig` 가 여러 번 불려도 `security` 를 다시 띄우지 않게
 * 읽은 값과 쓴 값을 인스턴스에 기억한다. 실패는 기억하지 않는다.
 */
export function createKeychainSecretStore(
  accountFor: (field: SecretField) => string = (field) => field,
): SecretStore {
  const cache = new Map<SecretField, string | undefined>();

  async function run(
    action: string,
    name: SecretField,
    args: string[],
    input?: string,
    secret?: string,
  ): Promise<RunResult> {
    try {
      return await runSecurity(args, input);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw keychainError(action, name, redact(detail, secret), err);
    }
  }

  return {
    async get(name) {
      if (cache.has(name)) return cache.get(name);
      const result = await run("읽지", name, [
        "find-generic-password",
        "-s",
        KEYCHAIN_SERVICE,
        "-a",
        accountFor(name),
        "-w",
      ]);
      if (result.code === EXIT_ITEM_NOT_FOUND) {
        cache.set(name, undefined);
        return undefined;
      }
      if (result.code !== 0) {
        throw keychainError("읽지", name, failureDetail(result));
      }
      // 끝 개행 하나만 뗀다. 값 앞뒤의 공백은 값의 일부다.
      const value = result.stdout.endsWith("\n")
        ? result.stdout.slice(0, -1)
        : result.stdout;
      cache.set(name, value);
      return value;
    },

    async set(name, value) {
      assertStorableSecret(name, value);
      // `-w <값>` 은 ps 에 보이고, `-w` 만 주면 tty 에서 읽느라 멈춘다.
      // 그래서 `security -i` 의 stdin 으로 명령 한 줄을 넘긴다.
      const line =
        `add-generic-password -U -s ${KEYCHAIN_SERVICE} -a ${accountFor(name)} ` +
        `-w ${quoteForInteractive(value)}\n`;
      const result = await run("저장하지", name, ["-i"], line, value);
      if (result.code !== 0) {
        cache.delete(name);
        throw keychainError("저장하지", name, failureDetail(result, value));
      }
      cache.set(name, value);
    },

    async delete(name) {
      const result = await run("지우지", name, [
        "delete-generic-password",
        "-s",
        KEYCHAIN_SERVICE,
        "-a",
        accountFor(name),
      ]);
      if (result.code !== 0 && result.code !== EXIT_ITEM_NOT_FOUND) {
        cache.delete(name);
        throw keychainError("지우지", name, failureDetail(result));
      }
      cache.set(name, undefined);
    },
  };
}

const keychainStores = new Map<string, SecretStore>();

/**
 * 이 OS 의 비밀 저장소를 돌려준다. `null` 이면 config.json 에 평문으로 저장한다.
 * `configPath` 는 비밀값의 주인인 config.json 경로다. 키체인 account 를 이 경로로 나눈다.
 *
 * 테스트는 이 모듈을 `vi.mock` 해서 `null` 이나 가짜 저장소를 돌려주게 한다.
 * 실행 OS 에 따라 실제 키체인을 건드리지 않게 하기 위해서다.
 */
export function getSecretStore(configPath: string): SecretStore | null {
  if (process.platform !== "darwin") return null;
  let store = keychainStores.get(configPath);
  if (!store) {
    store = createKeychainSecretStore((field) => keychainAccount(field, configPath));
    keychainStores.set(configPath, store);
  }
  return store;
}
