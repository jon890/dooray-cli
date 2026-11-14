/** 영역이 함께 쓰는 응답 구조와 DTO 다. */

// ─── Common ─────────────────────────────────────────────

export interface DoorayApiHeader {
  isSuccessful: boolean;
  resultCode: number;
  resultMessage: string;
}

export interface DoorayApiResponse<T> {
  header: DoorayApiHeader;
  result: T;
}

export interface DoorayApiNullableResponse<T> {
  header: DoorayApiHeader;
  result: T | null;
}

export type DoorayApiUnitResponse = DoorayApiNullableResponse<undefined>;

export interface DoorayApiErrorHeader {
  resultMessage: string;
}

export interface DoorayErrorResponse {
  header: DoorayApiErrorHeader;
}

export interface PostUser {
  type: string;
  member?: Member;
  emailUser?: EmailUser;
  group?: Group;
  workflow?: Workflow;
}

export interface PostUsers {
  from: PostUser;
  to: PostUser[];
  cc: PostUser[];
}

export interface PostBody {
  mimeType: string;
  content: string;
}

export interface EmailUser {
  emailAddress: string;
  name: string;
}

export interface Member {
  organizationMemberId: string;
  name?: string;
}

export interface Group {
  projectMemberGroupId: string;
  members: Member[];
}

export interface Workflow {
  id: string;
  name: string;
}
