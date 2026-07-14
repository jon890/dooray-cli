import type { Wiki, WikiPage, WikiPageDetail } from "../api/types.js";
import type { OutputOptions } from "./table.js";
import { output, printJson, printQuiet } from "./table.js";

export function formatWikiList(wikis: Wiki[], opts: OutputOptions): void {
  output(opts, {
    headers: ["ID", "Name", "Type"],
    rows: wikis.map((w) => [w.id, w.name, w.type]),
    raw: wikis,
    ids: wikis.map((w) => w.id),
  });
}

export function formatWikiPages(pages: WikiPage[], opts: OutputOptions): void {
  output(opts, {
    headers: ["ID", "Subject", "Creator"],
    rows: pages.map((p) => [
      p.id,
      p.subject,
      p.creator?.member?.name ?? "",
    ]),
    raw: pages,
    ids: pages.map((p) => p.id),
  });
}

export interface WikiTreeNode {
  page: WikiPage;
  children: WikiTreeNode[];
}

export function buildWikiTree(pages: WikiPage[]): WikiTreeNode[] {
  const ids = new Set(pages.map((p) => p.id));
  const childrenByParent = new Map<string, WikiPage[]>();
  const roots: WikiPage[] = [];

  for (const page of pages) {
    const parentId = page.parentPageId;
    const isRoot = page.root === true || !parentId || !ids.has(parentId);
    if (isRoot) {
      roots.push(page);
      continue;
    }
    const siblings = childrenByParent.get(parentId) ?? [];
    siblings.push(page);
    childrenByParent.set(parentId, siblings);
  }

  const toNode = (page: WikiPage): WikiTreeNode => ({
    page,
    children: (childrenByParent.get(page.id) ?? []).map(toNode),
  });

  return roots.map(toNode);
}

function normalizeSubject(subject: string): string {
  return subject.replace(/[\r\n]+/g, " ");
}

export function renderWikiTree(nodes: WikiTreeNode[], prefix = ""): string {
  const lines: string[] = [];

  nodes.forEach((node, index) => {
    const isLast = index === nodes.length - 1;
    const connector = isLast ? "└─" : "├─";
    const subject = normalizeSubject(node.page.subject);
    lines.push(`${prefix}${connector}${subject} (${node.page.id})`);

    if (node.children.length > 0) {
      const childPrefix = prefix + (isLast ? "   " : "│  ");
      lines.push(renderWikiTree(node.children, childPrefix));
    }
  });

  return lines.join("\n");
}

export function formatWikiTree(pages: WikiPage[], opts: OutputOptions): void {
  if (opts.json) {
    printJson(pages);
    return;
  }
  if (opts.quiet) {
    printQuiet(pages.map((p) => p.id));
    return;
  }
  process.stdout.write(renderWikiTree(buildWikiTree(pages)) + "\n");
}

export function formatWikiPageDetail(page: WikiPageDetail, opts: OutputOptions): void {
  if (opts.json) {
    printJson(page);
    return;
  }

  const lines: string[] = [
    `${page.subject}`,
    `ID: ${page.id}`,
    `Wiki: ${page.wikiId}`,
    `버전: ${page.version}`,
    `작성자: ${page.creator?.member?.name ?? ""}`,
    ...(page.createdAt ? [`생성: ${page.createdAt}`] : []),
    ...(page.updatedAt ? [`수정: ${page.updatedAt}`] : []),
    "",
    page.body?.content ?? "",
  ];
  process.stdout.write(lines.join("\n") + "\n");
}
