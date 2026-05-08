import type { CachedMe } from "../cache/types.js";
import { DoorayCliError } from "./errors.js";
import { EXIT_PARAM_ERROR } from "./exit-codes.js";

// markdown link 텍스트 안의 특수문자 escape
export function escapeLinkText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/\[/g, "&#91;")
    .replace(/\]/g, "&#93;")
    .replace(/—/g, "&mdash;");
}

export interface TaskLinkInput {
  projectCode: string;
  number: number;
  postId: string;
  subject: string;
  workflowClass?: string; // 호버 title 용 (옵션)
}

export function buildTaskLink(t: TaskLinkInput, me: CachedMe): string {
  const text = `${t.projectCode}/${t.number} ${escapeLinkText(t.subject)}`;
  const url = `dooray://${me.orgId}/tasks/${t.postId}`;
  if (t.workflowClass) {
    const safeClass = t.workflowClass.replace(/"/g, "&quot;");
    return `[${text}](${url} "${safeClass}")`;
  }
  return `[${text}](${url})`;
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
export function appendTaskLinks(body: string, links: TaskLinkInput[], me: CachedMe): string {
  if (links.length === 0) return body;
  const rendered = links.map((l) => buildTaskLink(l, me)).join("\n");
  if (!body) return rendered;
  return body.replace(/\n*$/, "") + "\n\n" + rendered;
}
