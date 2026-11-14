/** 영역이 함께 쓰는 응답 구조와 오류 DTO 다. */

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
