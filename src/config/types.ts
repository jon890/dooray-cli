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
