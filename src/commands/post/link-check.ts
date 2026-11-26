/**
 * post create·edit 와 post comment add·edit 가 본문을 보내기 전에 거치는 업무 링크 검사 (ADR-085).
 *
 * 옵션 등록과 결과 출력만 여기 둔다. 판정은 `resolvers/link-check.ts` 가 맡는다.
 */

import type { Command } from "commander";
import type { Config } from "@/config/types.js";
import type { PostClient } from "@/api/post/types.js";
import type { MemberClient } from "@/api/member/types.js";
import { MARKDOWN_MIME } from "@/body/body-input.js";
import { checkTaskLinks, hasTaskLinks, type LinkIssue } from "@/resolvers/link-check.js";
import { ensureMe } from "@/resolvers/me.js";
import { stopSpinner } from "@/utils/spinner.js";
import { DoorayCliError } from "@/utils/errors.js";
import { EXIT_LINK_CHECK_ERROR } from "@/utils/exit-codes.js";

export interface LinkCheckCliOptions {
  /** `--no-link-check` 를 주면 false 다. */
  linkCheck?: boolean;
  fixLinks?: boolean;
}

export function addLinkCheckOptions(cmd: Command): Command {
  return cmd
    .option("--fix-links", "본문 업무 링크의 대괄호와 업무 웹 주소를 고쳐서 보낸다 (번호가 다른 링크는 고치지 않고 멈춘다)")
    .option("--no-link-check", "본문 업무 링크 검사를 끈다");
}

/**
 * 본문의 업무 링크를 검사하고 보낼 본문을 돌려준다.
 * 고치지 못한 문제가 있으면 종료 코드 7 로 멈춘다. 조회 실패는 경고만 한다.
 */
export async function runLinkCheck(
  client: PostClient & MemberClient,
  config: Pick<Config, "tenantName">,
  body: string,
  opts: LinkCheckCliOptions,
  mimeType: string = MARKDOWN_MIME,
): Promise<string> {
  // text/html 본문은 마크다운 링크를 쓰지 않는다 (ADR-055).
  if (opts.linkCheck === false || mimeType !== MARKDOWN_MIME) return body;
  const tenantName = config.tenantName || undefined;
  if (!hasTaskLinks(body, tenantName)) return body;

  const me = await ensureMe(client);
  const result = await checkTaskLinks(client, body, {
    orgId: me.orgId,
    tenantName,
    fix: !!opts.fixLinks,
  });

  for (const w of result.warnings) process.stderr.write(`⚠  ${w}\n`);
  if (result.fixed.length > 0) {
    process.stderr.write(`업무 링크 ${result.fixed.length}개를 고쳐서 보냅니다.\n`);
    for (const issue of result.fixed) process.stderr.write(`  ${issue.suggestion}\n`);
  }

  if (result.errors.length > 0) {
    stopSpinner(false);
    throw new DoorayCliError(formatErrors(result.errors), EXIT_LINK_CHECK_ERROR);
  }
  return result.body;
}

function formatErrors(errors: LinkIssue[]): string {
  const lines = [`본문의 업무 링크 ${errors.length}개가 형식에 맞지 않아 보내지 않았습니다.`];
  for (const e of errors) {
    lines.push(`  링크: ${e.original}`);
    lines.push(`  이유: ${e.message}`);
    lines.push(`  고친 꼴: ${e.suggestion}`);
  }
  const hints: string[] = [];
  if (errors.some((e) => e.fixable)) hints.push("--fix-links 를 주면 대괄호와 웹 주소를 고쳐서 보냅니다.");
  if (errors.some((e) => !e.fixable)) hints.push("번호가 다르거나 조회하지 못한 링크는 본문을 직접 고칩니다.");
  hints.push("검사를 끄려면 --no-link-check 를 줍니다.");
  return [...lines, ...hints].join("\n");
}
