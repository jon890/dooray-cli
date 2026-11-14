/** 웹 내부 응답을 공식 필드로 바꾸기 전에 구조·식별자·날짜를 검사한다. */
import { DoorayCliError } from "../../utils/errors.js";
import { EXIT_API_ERROR } from "../../utils/exit-codes.js";
import type { Project, MemberDetail, MeDetail } from "../types.js";

export type Row = Record<string, unknown>;
export function invalidResponse(): never { throw new DoorayCliError("웹 응답의 필수 필드나 구조가 바뀌었습니다.", EXIT_API_ERROR); }
export function row(value: unknown): Row {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalidResponse();
  return value as Row;
}
export function rows(value: unknown): Row[] {
  if (!Array.isArray(value)) return invalidResponse();
  return value.map(row);
}
export function identifier(value: unknown): string {
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return String(value);
  return invalidResponse();
}
export function text(value: unknown): string {
  if (typeof value !== "string") return invalidResponse();
  return value;
}
export function count(value: unknown): number {
  const n = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  if (typeof n !== "number" || !Number.isSafeInteger(n) || n < 0) return invalidResponse();
  return n;
}
export function pick(source: Row, fields: string[]): Row {
  return Object.fromEntries(fields.filter((key) => source[key] !== undefined && source[key] !== null).map((key) => [key, source[key]]));
}
export function referenceMap(refs: unknown, name: string): Row {
  if (refs === undefined || refs === null) return {};
  return row(row(refs)[name] ?? {});
}
export function date(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?)?[+-]\d{2}:\d{2}$/.test(value)) return value;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T.*Z$/.test(value) && Number.isFinite(Date.parse(value))) return value.replace(/Z$/, "+00:00");
  if (typeof value === "number" && Number.isFinite(new Date(value).getTime())) {
    const d = new Date(value), offset = -d.getTimezoneOffset();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${offset >= 0 ? "+" : "-"}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`;
  }
  return invalidResponse();
}
export function project(value: unknown): Project {
  const valueRow = row(value);
  const out: Project = { ...pick(valueRow, ["description", "state", "scope", "type", "projectCategoryId"]), id: identifier(valueRow.id), code: text(valueRow.code) };
  for (const key of ["organization", "drive", "wiki"] as const) {
    const id = valueRow[`${key}Id`] ?? (valueRow[key] ? row(valueRow[key]).id : undefined);
    if (id !== undefined && id !== null) out[key] = { id: identifier(id) };
  }
  return out;
}
export function member(value: unknown, detailed = true): MemberDetail & Partial<MeDetail> {
  const source = row(value);
  const out: MemberDetail & Partial<MeDetail> = {
    ...pick(source, detailed ? ["idProviderType", "idProviderUserId", "userCode", "externalEmailAddress", "locale", "timezoneName", "englishName", "nativeName", "nickname", "displayMemberId"] : ["userCode", "externalEmailAddress"]),
    id: identifier(source.id), name: text(source.name),
  };
  if (detailed) {
    const org = source.defaultOrganization ? row(source.defaultOrganization) : {};
    const id = org.organizationId ?? org.id ?? source.defaultOrganizationId;
    if (id !== undefined && id !== null) out.defaultOrganization = { id: identifier(id) };
  }
  return out;
}
