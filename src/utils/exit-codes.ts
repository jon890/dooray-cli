export const EXIT_SUCCESS = 0;
export const EXIT_API_ERROR = 1;
export const EXIT_AUTH_ERROR = 2;
export const EXIT_PARAM_ERROR = 3;
export const EXIT_CONFIG_ERROR = 4;
/** 파일 시스템 오류. 캐시 삭제 실패처럼 ~/.dooray/ 아래 로컬 상태를 다루다 실패한 경우다 (ADR-042) */
export const EXIT_IO_ERROR = 5;
/** API 호출 한도 초과(HTTP 429). 재시도를 다 쓴 뒤에도 429 면 이 코드로 끝난다. 부르는 쪽이 기다렸다 다시 부를 수 있게 다른 API 오류와 나눈다 */
export const EXIT_RATE_LIMITED = 6;
