import readline from "node:readline";
import { DoorayCliError } from "./errors.js";
import { EXIT_PARAM_ERROR } from "./exit-codes.js";

export function extractAttachmentFileIds(body: string): Set<string> {
  const ids = new Set<string>();
  // !?\[...\]\(/files/<id>...\) — id 종결자: 공백 / `)` / `?` (query) / `#` (fragment).
  // `[^\s)]+` 만 쓰면 `/files/abc?dl=1` 에서 `abc?dl=1` 을 id 로 잘못 추출하여 attachments 의 `abc` 와 매칭 실패.
  // code block 내부 표기도 매칭됨 — 보수적 검출 우선.
  const re = /!?\[[^\]]*\]\(\/files\/([^\s)?#]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    ids.add(m[1]);
  }
  return ids;
}

export interface DroppedAttachment {
  id: string;
  name?: string;
}

export function findDroppedAttachments(
  oldBody: string,
  newBody: string,
  attachments: ReadonlyArray<{ id: string; name?: string }>,
): DroppedAttachment[] {
  const oldIds = extractAttachmentFileIds(oldBody);
  const newIds = extractAttachmentFileIds(newBody);
  const dropped: DroppedAttachment[] = [];
  for (const att of attachments) {
    if (oldIds.has(att.id) && !newIds.has(att.id)) {
      dropped.push({ id: att.id, name: att.name });
    }
  }
  return dropped;
}

// 서버에서 받은 파일명에 ANSI escape 나 control sequence 가 들어있을 수 있어
// 터미널 변조 방지 목적으로 출력 직전 sanitize.
export function sanitizeFileName(name: string): string {
  return name.replace(/[\x00-\x1F\x7F]/g, "?");
}

function printDroppedWarning(dropped: DroppedAttachment[]): void {
  process.stderr.write(`⚠  새 본문에서 ${dropped.length}개 attachment reference 가 빠집니다:\n`);
  for (const a of dropped) {
    const safe = a.name ? sanitizeFileName(a.name) : undefined;
    process.stderr.write(`   - /files/${a.id}  ${safe ? "← " + safe : ""}\n`);
  }
  process.stderr.write(`   (attachment 자체는 서버에 남지만 본문에서 사라져 보입니다.)\n`);
}

// 사용자 입력만 처리. true = 진행, false = 취소. 호출처가 throw 결정.
export async function confirmDropped(): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  const answer = await new Promise<string>((resolve) => {
    rl.question("계속 진행하시겠습니까? (y/N) ", resolve);
  });
  rl.close();
  return /^y(es)?$/i.test(answer.trim());
}

// dropped 검출 → 경고 출력 → confirm/abort 분기. 호출처에서 한 줄로 사용.
export async function checkAndGuardDropped(
  oldBody: string,
  newBody: string,
  attachments: ReadonlyArray<{ id: string; name?: string }>,
  noConfirm: boolean,
): Promise<void> {
  const dropped = findDroppedAttachments(oldBody, newBody, attachments);
  if (dropped.length === 0) return;

  printDroppedWarning(dropped);

  if (noConfirm) {
    process.stderr.write(`   --no-confirm 플래그로 그대로 진행합니다.\n`);
    return;
  }

  if (!process.stdin.isTTY) {
    throw new DoorayCliError(
      "non-TTY 환경에서 누락 attachment 가 감지되었습니다. 의도한 변경이면 --no-confirm 플래그로 다시 실행하세요.",
      EXIT_PARAM_ERROR,
    );
  }

  const confirmed = await confirmDropped();
  if (!confirmed) {
    throw new DoorayCliError("취소되었습니다.", EXIT_PARAM_ERROR);
  }
}
