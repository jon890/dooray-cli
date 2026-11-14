# 웹 세션 인증 PR1 인수 검증 계획

## 인수 검증 계획

| 요구사항 | 준비 조건 | 실행 절차 | 기대 결과 | 실행 환경 | 실행 담당 | 선행 조건 | 시점 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| REQ1, REQ5, REQ15, REQ16 | 격리한 설정 | web-auth 와 store 테스트, API 키 없이 웹 설정으로 CLI 실행 | 네 클라우드 주소, 잘못된 설정은 4, 기존 API 방식 유지 | 임시 HOME·mock | worker | 없음 | PR 전 |
| REQ2, REQ3 | 가짜 쿠키·가짜 키체인 | 쿠키 파서·store·secret-store 테스트, CLI config get | SESSION 만 저장, 출력과 오류에 비밀값 없음 | 임시 HOME·mock | worker | 없음 | PR 전 |
| REQ4, REQ9 | 가짜 fetch | web-http 테스트 | 다른 origin 요청 없음, 리다이렉트·401·403·HTML 을 구분 | 로컬 mock | worker | 없음 | PR 전 |
| REQ6, REQ7 | 공식 문서와 실측 응답 형태 | web-client 테스트, remote-verification 의 실측 | 공식 필드·날짜·문자열 ID, 태그 생성·그룹 변경과 정리 | 로컬 mock·허용한 웹 프로젝트 | worker | 없음 | PR 전 |
| REQ8, REQ17 | 웹 설정 | web-support 테스트와 CLI post list | 미지원 명령·옵션은 요청 전 3, API·mail 은 통과 | 임시 HOME·mock | worker | 없음 | PR 전 |
| REQ10, REQ11 | 기존 두 방식 비밀값 | setup·config 테스트 | 첫 방식 질문, 가린 입력, 다른 비밀값 보존, 켤 때 한 번 경고 | 로컬 mock | worker | 없음 | PR 전 |
| REQ12 | 유효·만료 웹 세션 mock | doctor 테스트 | API 키 없이 getMe 직접 호출, 만료 안내와 실패 종료 코드 | 로컬 mock | worker | 없음 | PR 전 |
| REQ13 | 기존 캐시 | services/config 테스트 | 방식·쿠키·웹 테넌트 변경 후 전체 캐시 삭제 | 임시 파일·mock | worker | 없음 | PR 전 |
