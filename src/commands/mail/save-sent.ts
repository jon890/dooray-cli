import type { Config } from "../../config/types.js";
import { saveToSent } from "../../api/imapClient.js";

export interface SaveSentOutcome {
  savedToSent: boolean;
  saveSentError?: string;
}

// 발송이 끝난 뒤에 부른다. 저장이 실패해도 재발송하지 않고 경고만 낸다 (ADR-077).
export async function saveSentCopy(
  config: Config,
  raw: Buffer,
  enabled: boolean,
): Promise<SaveSentOutcome> {
  if (!enabled) return { savedToSent: false };
  const result = await saveToSent(config, raw);
  if (result.saved) return { savedToSent: true };
  process.stderr.write(
    `경고: 메일은 발송했지만 보낸메일함에 저장하지 못했습니다. 다시 보내지 마세요. (${result.reason})\n`,
  );
  return { savedToSent: false, saveSentError: result.reason };
}
