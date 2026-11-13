/** 멤버 기본 조회·검색만 지원한다. 소속 보강은 캘린더 웹 경로 구현 뒤에 붙인다. */
export const memberWebSupport = {
  "member list": [],
  "member get": ["withOrg"],
  "member search": [],
} as const;
