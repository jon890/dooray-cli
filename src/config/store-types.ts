/** 설정 읽기·삭제 결과와 파일에 저장하는 설정의 타입. */
import type { Config } from "@/config/types.js";

export type ConfigReadResult =
  | { state: "ok"; config: Config }
  | { state: "absent" }
  | { state: "invalid"; reason: string }
  | { state: "unreadable"; reason: string; source?: "keychain" };

export type ClearMailResult =
  | { state: "cleared"; hadCredentials: boolean }
  | { state: "absent" }
  | { state: "failed"; reason: string };

/** config.json 에 적힌 그대로의 형태다. `apiKey` 가 없을 수 있다. */
export type StoredConfig = Omit<Config, "apiKey"> & { apiKey?: string };

export type ConfigFileReadResult =
  | { state: "ok"; stored: StoredConfig }
  | Exclude<ConfigReadResult, { state: "ok" }>;
