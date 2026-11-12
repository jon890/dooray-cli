import type { MemberDetail, MemberOrganization } from "../api/types.js";
import type { OutputOptions } from "./table.js";
import { output, printJson } from "./table.js";

/**
 * 멤버 상세를 출력한다.
 *
 * `organization` 은 `--with-org` 를 준 호출에서만 넘어온다. 없으면 출력은 응답 그대로다 (ADR-056).
 */
export function formatMemberDetail(
  member: MemberDetail,
  opts: OutputOptions,
  organization?: MemberOrganization,
): void {
  if (opts.json) {
    printJson(organization ? { ...member, organization } : member);
    return;
  }
  if (opts.quiet) { process.stdout.write(member.id + "\n"); return; }
  const lines = [
    `이름: ${member.name}`,
    ...(member.englishName ? [`영문명: ${member.englishName}`] : []),
    ...(member.nickname ? [`별명: ${member.nickname}`] : []),
    ...(member.userCode ? [`사번/ID: ${member.userCode}`] : []),
    ...(member.externalEmailAddress ? [`외부 이메일: ${member.externalEmailAddress}`] : []),
    ...(organization ? organizationLines(organization) : []),
    `member-id: ${member.id}`,
  ];
  process.stdout.write(lines.join("\n") + "\n");
}

/** 값이 없는 항목은 줄을 만들지 않는다. 부서 id 는 이름이 있어도 null 로 오므로 이름만 본다. */
function organizationLines(org: MemberOrganization): string[] {
  return [
    ["회사", org.defaultOrganization?.name],
    ["부서", org.primaryDepartment?.name],
    ["직책", org.positionName],
  ]
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .map(([label, value]) => `${label}: ${value}`);
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
