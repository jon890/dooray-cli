# 웹 세션 인증 PR3(wiki) 인수 검증 계획

## 인수 검증 계획

| 요구사항 | 준비 조건 | 실행 절차 | 기대 결과 | 실행 환경 | 실행 담당 | 선행 조건 | 시점 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| REQ6 | `docs/api/web-endpoints/wiki.md` 의 공식 필드 목록, 실측 응답 꼴의 가짜 고정 파일 | `src/api/wiki/web.test.ts` 의 변환 테스트 | 키·구조·날짜 형식·문자열 id 가 공식 스키마와 같고 웹 전용 필드가 없다 | 로컬 mock | worker | PR1 머지 | PR 전 |
| REQ6 | 같은 | 같은 테스트의 페이지 넘기기·댓글 최신순 | 목록 루프가 같은 페이지를 거듭 받지 않고 댓글 `page`·`size` 가 공식 순서와 같다 | 로컬 mock | worker | PR1 머지 | PR 전 |
| REQ6, REQ7 | 임시 HOME 에 쿠키, 허용된 위키 | CLI 로 wiki 명령 전체를 웹 방식으로 실행하고 `--json` 을 공식 문서와 대조 | 명령이 성공하고 필드가 공식 스키마와 맞다 | 허용된 웹 위키 | worker | PR1 머지 | PR 전 |
| REQ7 | 같은 | `[cli-web-probe]` 페이지의 생성·수정·이동·첨부·댓글·삭제 | 웹에서 반영이 확인되고 끝에 프로브 페이지가 남지 않는다 | 허용된 웹 위키 | worker | PR1 머지 | PR 전 |
| REQ8 | 웹 방식 설정 | `web-support/wiki.test.ts`, CLI 로 `--mime-type text/html`, `--to-wiki` 실행 | API 호출 없이 종료 코드 3 과 안내 문구, 가이드 표와 목록이 같다 | 임시 HOME·mock | worker | PR1 머지 | PR 전 |
