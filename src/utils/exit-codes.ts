export const EXIT_SUCCESS = 0;
export const EXIT_API_ERROR = 1;
export const EXIT_AUTH_ERROR = 2;
export const EXIT_PARAM_ERROR = 3;
export const EXIT_CONFIG_ERROR = 4;
/** 파일 시스템 오류. 캐시 삭제 실패처럼 ~/.dooray/ 아래 로컬 상태를 다루다 실패한 경우다 (ADR-042) */
export const EXIT_IO_ERROR = 5;
