export interface Config {
  version: 1;
  apiKey: string;
  baseUrl: string;
  tenantName?: string;
  imapHost?: string;
  imapPort?: number;
  imapUsername?: string;
  imapPassword?: string;
  smtpHost?: string;
  smtpPort?: number;
  trackLastRun?: boolean;
}

/**
 * `config set` 이 받는 키와 그 값이 비밀값인지 여부.
 *
 * 비밀값이면 `feedback --last` 가 첨부하는 직전 실행 기록에서 값 자리를 가린다 (ADR-023).
 * 키를 더할 때 `secret` 을 함께 정해야 하도록 한 곳에 둔다.
 */
export const CONFIG_SET_KEYS = {
  "api-key": { secret: true },
  "base-url": { secret: false },
  "tenant-name": { secret: false },
  "imap-host": { secret: false },
  "imap-port": { secret: false },
  "imap-username": { secret: false },
  "imap-password": { secret: true },
  "smtp-host": { secret: false },
  "smtp-port": { secret: false },
  "track-last-run": { secret: false },
} as const satisfies Record<string, { secret: boolean }>;

export function isSecretConfigKey(key: string): boolean {
  return Object.hasOwn(CONFIG_SET_KEYS, key) &&
    CONFIG_SET_KEYS[key as keyof typeof CONFIG_SET_KEYS].secret;
}

export const API_ENDPOINTS = {
  "민간 클라우드": "https://api.dooray.com",
  "공공 클라우드": "https://api.gov-dooray.com",
  "공공 업무망 클라우드": "https://api.gov-dooray.co.kr",
  "금융 클라우드": "https://api.dooray.co.kr",
} as const;

export const DEFAULTS = {
  baseUrl: "https://api.dooray.com",
  tenantName: "example",
  imapHost: "imap.dooray.com",
  imapPort: 993,
  smtpHost: "smtp.dooray.com",
  smtpPort: 465,
} as const;
