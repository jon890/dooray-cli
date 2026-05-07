import type { MemberDetail } from "../api/types.js";
import type { OutputOptions } from "./table.js";
import { output, printJson } from "./table.js";

export function formatMemberDetail(member: MemberDetail, opts: OutputOptions): void {
  if (opts.json) { printJson(member); return; }
  if (opts.quiet) { process.stdout.write(member.id + "\n"); return; }
  const lines = [
    `이름: ${member.name}`,
    ...(member.englishName ? [`영문명: ${member.englishName}`] : []),
    ...(member.nickname ? [`별명: ${member.nickname}`] : []),
    ...(member.userCode ? [`사번/ID: ${member.userCode}`] : []),
    ...(member.externalEmailAddress ? [`외부 이메일: ${member.externalEmailAddress}`] : []),
    `member-id: ${member.id}`,
  ];
  process.stdout.write(lines.join("\n") + "\n");
}

export interface MemberListRow {
  id: string;
  name: string;
  role?: string;
}

export function formatMemberList(rows: MemberListRow[], opts: OutputOptions): void {
  output(opts, {
    headers: ["ID", "Name", "Role"],
    rows: rows.map((r) => [r.id, r.name, r.role ?? ""]),
    raw: rows,
    ids: rows.map((r) => r.id),
  });
}

export function formatMemberSearchResults(members: MemberDetail[], opts: OutputOptions): void {
  output(opts, {
    headers: ["ID", "Name", "UserCode", "Nickname", "Email"],
    rows: members.map((m) => [
      m.id,
      m.name,
      m.userCode ?? "",
      m.nickname ?? "",
      m.externalEmailAddress ?? "",
    ]),
    raw: members,
    ids: members.map((m) => m.id),
  });
}
