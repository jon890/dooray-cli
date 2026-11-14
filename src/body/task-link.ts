import type { CachedMe } from "../cache/types.js";
import { DoorayCliError } from "./errors.js";
import { EXIT_PARAM_ERROR } from "./exit-codes.js";
import { buildLink, escapeLinkText } from "./body-markup.js";
import { MARKDOWN_MIME } from "./body-input.js";

// escapeLinkText 의 본체는 body-markup.ts 로 옮겼다. 링크 텍스트 escape 의 이름이
// 이 파일에서 사라지면 읽는 사람이 다시 찾아야 하므로 여기서 다시 내보낸다.
export { escapeLinkText };

export interface TaskLinkInput {
  projectCode: string;
  number: number;
  postId: string;
  subject: string;
  workflowClass?: string; // 호버 title 용 (옵션)
}

export function buildTaskLink(
  t: TaskLinkInput,
  me: CachedMe,
  mimeType: string = MARKDOWN_MIME,
): string {
  return buildLink(mimeType, {
    text: `${t.projectCode}/${t.number} ${escapeLinkText(t.subject)}`,
    url: `dooray://${me.orgId}/tasks/${t.postId}`,
    title: t.workflowClass || undefined,
  });
}

export function parseLinkRef(ref: string): { projectArg?: string; postNumberArg?: string; idOpt?: string } {
  if (/^[0-9]{15,}$/.test(ref)) return { idOpt: ref };
  if (ref.includes("/")) {
    const [p, n] = ref.split("/");
    if (!p || !n) {
      throw new DoorayCliError(
        `--link-task 형식이 올바르지 않습니다: "${ref}". <project>/<number> 또는 postId를 입력하세요.`,
        EXIT_PARAM_ERROR,
      );
    }
    return { projectArg: p, postNumberArg: n };
  }
  throw new DoorayCliError(
    `--link-task 형식이 올바르지 않습니다: "${ref}". <project>/<number> 또는 postId를 입력하세요.`,
    EXIT_PARAM_ERROR,
  );
}

// body 끝에 task link 들을 줄바꿈 후 append. 본문이 비어있어도 형식 유지.
export function appendTaskLinks(
  body: string,
  links: TaskLinkInput[],
  me: CachedMe,
  mimeType: string = MARKDOWN_MIME,
): string {
  if (links.length === 0) return body;
  const rendered = links.map((l) => buildTaskLink(l, me, mimeType)).join("\n");
  if (!body) return rendered;
  return body.replace(/\n*$/, "") + "\n\n" + rendered;
}
