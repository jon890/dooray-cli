import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import tmp from "tmp";
import yaml from "js-yaml";
import type { PostDetail } from "../api/types.js";
import type { CachedMember } from "../cache/types.js";
import { DoorayCliError } from "../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../utils/exit-codes.js";

export function openInEditor(content: string): Promise<string> {
  const editor = process.env.EDITOR;
  if (!editor) {
    throw new DoorayCliError(
      "$EDITOR 환경변수가 설정되지 않았습니다. export EDITOR=vim 등으로 설정해주세요.",
      EXIT_PARAM_ERROR,
    );
  }

  const tmpFile = tmp.fileSync({ prefix: "dooray-", postfix: ".md" });

  return new Promise(async (resolve, reject) => {
    try {
      await fs.writeFile(tmpFile.name, content, "utf-8");

      const child = spawn(editor, [tmpFile.name], {
        stdio: "inherit",
      });

      child.on("error", (err) => {
        tmpFile.removeCallback();
        reject(err);
      });

      child.on("exit", async (code) => {
        try {
          if (code !== 0) {
            throw new DoorayCliError(
              `에디터가 비정상 종료되었습니다 (exit code: ${code})`,
              EXIT_PARAM_ERROR,
            );
          }
          const result = await fs.readFile(tmpFile.name, "utf-8");
          resolve(result);
        } catch (e) {
          reject(e);
        } finally {
          tmpFile.removeCallback();
        }
      });
    } catch (e) {
      tmpFile.removeCallback();
      reject(e);
    }
  });
}

export interface PostFrontmatter {
  subject: string;
  priority: string;
  due_date: string | null;
  to: string[];
  cc: string[];
}

export interface ParsedPost extends PostFrontmatter {
  body: string;
}

function memberIdToName(
  memberId: string,
  members: CachedMember[],
): string {
  const member = members.find(
    (m) => m.organizationMemberId === memberId,
  );
  return member?.name ?? memberId;
}

export function serializePostFrontmatter(
  post: PostDetail,
  members: CachedMember[],
): string {
  const frontmatter: PostFrontmatter = {
    subject: post.subject,
    priority: post.priority,
    due_date: post.dueDate ?? null,
    to: post.users.to
      .map((u) => {
        if (u.member) return memberIdToName(u.member.organizationMemberId, members);
        if (u.emailUser) return u.emailUser.emailAddress;
        return "";
      })
      .filter(Boolean),
    cc: post.users.cc
      .map((u) => {
        if (u.member) return memberIdToName(u.member.organizationMemberId, members);
        if (u.emailUser) return u.emailUser.emailAddress;
        return "";
      })
      .filter(Boolean),
  };

  const yamlStr = yaml.dump(frontmatter, {
    quotingType: '"',
    forceQuotes: false,
    lineWidth: -1,
  });

  return `---\n${yamlStr}---\n${post.body.content}`;
}

export function parsePostFrontmatter(content: string): ParsedPost {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    throw new DoorayCliError(
      "frontmatter 형식이 올바르지 않습니다. --- 구분자를 확인해주세요.",
      EXIT_PARAM_ERROR,
    );
  }

  const frontmatter = yaml.load(match[1]) as PostFrontmatter;
  const body = match[2];

  return {
    subject: frontmatter.subject ?? "",
    priority: frontmatter.priority ?? "normal",
    due_date: frontmatter.due_date ?? null,
    to: frontmatter.to ?? [],
    cc: frontmatter.cc ?? [],
    body,
  };
}

// ─── Wiki Frontmatter ───────────────────────────────────

export interface WikiFrontmatter {
  title: string;
}

export interface ParsedWikiPage extends WikiFrontmatter {
  body: string;
}

export function serializeWikiFrontmatter(page: { subject: string; body?: { content?: string } }): string {
  const frontmatter: WikiFrontmatter = {
    title: page.subject,
  };

  const yamlStr = yaml.dump(frontmatter, {
    quotingType: '"',
    forceQuotes: false,
    lineWidth: -1,
  });

  return `---\n${yamlStr}---\n${page.body?.content ?? ""}`;
}

export function parseWikiFrontmatter(content: string): ParsedWikiPage {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    throw new DoorayCliError(
      "frontmatter 형식이 올바르지 않습니다. --- 구분자를 확인해주세요.",
      EXIT_PARAM_ERROR,
    );
  }

  const frontmatter = yaml.load(match[1]) as WikiFrontmatter;
  const body = match[2];

  return {
    title: frontmatter.title ?? "",
    body,
  };
}
