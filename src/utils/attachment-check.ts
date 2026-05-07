import readline from "node:readline";
import { DoorayCliError } from "./errors.js";
import { EXIT_PARAM_ERROR } from "./exit-codes.js";

// 본문에 등장하는 모든 attachment file id 를 추출.
// markdown link/image 의 (/files/<id>) 형태만 인정한다.
export function extractAttachmentFileIds(body: string): Set<string> {
  const ids = new Set<string>();
  // !?\[...\]\(/files/<id>...\)  — id 종결자: 공백 / `)` / `?` (query) / `#` (fragment).
  // `[^\s)]+` 만 쓰면 `/files/abc?dl=1` 에서 `abc?dl=1` 을 id 로 잘못 추출하여 attachments 의 `abc` 와 매칭 실패.
  // code block 내부 표기도 매칭됨 — 보수적 검출 우선 (false-positive 가 false-negative 사고보다 안전).
  const re = /!?\[[^\]]*\]\(\/files\/([^\s)?#]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    ids.add(m[1]);
  }
  return ids;
}

// 기존 attachment 의 id 목록과 새 본문 비교 → 새 본문에서 빠진 id 반환.
// 기존 attachment 가 본문에 없었던 경우 (예: 단순 첨부) 는 dropped 로 보지 않음
// — 즉 "원래 본문에 reference 가 있었는데 새 본문에 없는 것" 만 dropped.
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

export async function guardDroppedAttachments(
  dropped: DroppedAttachment[],
  noConfirm: boolean,
): Promise<void> {
  process.stderr.write(`⚠  새 본문에서 ${dropped.length}개 attachment reference 가 빠집니다:\n`);
  for (const a of dropped) {
    process.stderr.write(`   - /files/${a.id}  ${a.name ? "← " + a.name : ""}\n`);
  }
  process.stderr.write(`   (attachment 자체는 서버에 남지만 본문에서 사라져 보입니다.)\n`);

  if (noConfirm) {
    process.stderr.write(`   --no-confirm 플래그로 그대로 진행합니다.\n`);
    return;
  }

  const isTty = process.stdin.isTTY;
  if (!isTty) {
    throw new DoorayCliError(
      "non-TTY 환경에서 누락 attachment 가 감지되었습니다. 의도한 변경이면 --no-confirm 플래그로 다시 실행하세요.",
      EXIT_PARAM_ERROR,
    );
  }

  // TTY 인터랙티브 confirm (default = N)
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  const answer = await new Promise<string>((resolve) => {
    rl.question("계속 진행하시겠습니까? (y/N) ", resolve);
  });
  rl.close();
  if (!/^y(es)?$/i.test(answer.trim())) {
    throw new DoorayCliError("취소되었습니다.", EXIT_PARAM_ERROR);
  }
}
