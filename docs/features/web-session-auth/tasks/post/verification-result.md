# post 웹 방식 검증 결과

확인일: 2026-11-14.
구현·개발 검사·실제 웹 인수 검증을 수행했다.
독립 코드 리뷰는 코디네이터의 검토를 기다린다.

## 요구사항별 결과

| 요구사항 | 결과와 근거 |
| --- | --- |
| REQ6 | 업무·댓글·파일의 가짜 HTTP 테스트에서 공식 필드·참조·ID 문자열·날짜를 검사했다. 실제 CLI get/list/search·댓글 조회·템플릿 생성을 비교했다. 상세 quiet는 기존 상세 포매터, 목록 quiet는 기존 업무 번호 출력을 유지한다 |
| REQ7 | 업무 생성·그룹 참여자·태그·단계·날짜·상위·상태·완료·수정·치환, 댓글 생성·수정·삭제, 업무·댓글 파일 upload/list/download/delete가 성공했다. 파일의 바이트가 같고 본문 수정 뒤 첨부 카드가 유지됐다 |
| REQ8, REQ17 | 등록한 명령과 setup 가이드의 표가 일치한다. emailUser 쓰기와 일정 없음으로 새로 바꾸기는 쓰기 전에 코드 3으로 실패한다. 기본값 옵션은 차단하지 않고 CLI에서 명시한 옵션만 판정한다 |
| REQ3, REQ4, REQ9 | 파일 경로가 PR1 바이트·multipart helper를 사용한다. 영역 테스트에서 로그인 302·HTML 200의 코드 2와 파일 소속을 검사했다. 307·신뢰 호스트 정책의 조합은 PR1 helper 테스트를 재사용했다 |

세부 경로·옵션·날짜·쓰기 데이터의 생성·삭제 결과는 `docs/api/web-endpoints/post.md`가 소유한다.
main의 post list에 workflow 옵션이 없어 새 옵션은 만들지 않았다.
상태 쿼리 변환은 getPosts의 HTTP 경계 테스트로 검사했다.

## 실행한 개발 검사

- pnpm test: 종료 코드 0.
- pnpm tsc --noEmit: 종료 코드 0.
- pnpm run build: 종료 코드 0.
- pnpm api:inventory: 종료 코드 0. 공개 client.ts의 정적 검사이며 웹 지원 증거로 세지 않는다.
- pnpm verify:package: 종료 코드 0.
- node scripts/check-pii.mjs, node scripts/check-public-refs.mjs: 종료 코드 0.
- plan의 verify_task --audit: 위반 없음.

로컬 pnpm 자동 버전 전환이 설치된 실행 파일 오류로 실패했다.
npm_config_manage_package_manager_versions=false를 명령에 지정해 설치된 pnpm으로 frozen-lockfile 설치와 검사를 실행했다.
package.json·lockfile·사용자의 전역 설정은 바꾸지 않았다.
CI의 지정 pnpm 버전 결과는 별도로 확인한다.

## 문서 정합성

검토 범위는 기능 spec·design, ADR-081·ADR-024·ADR-074, 영역 실측 기록, setup 가이드의 업무 절, PostClient와 웹 구현이다.

| 문서 | 바뀐 사실 또는 영향 없음의 근거 | 결과 |
| --- | --- | --- |
| spec.md·design.md·ADR-081 | 인증 선택·공식 응답 변환·미지원 실패·PR1 전송 경계 유지 | 정합 |
| docs/api/web-endpoints/post.md | 실제 경로·옵션·날짜·수정 필드 보존·상위 move·일정 없음 제약·삭제 결과 기록 | 문구 수정 뒤 구현과 재대조 |
| docs/guide/setup.md 업무 절 | 실제 지원 명령·데이터에 따른 제약·댓글 조회 비용을 지원 목록과 비교 | 정합 |
| ADR-024 | 댓글 본문 링크와 기존 첨부 카드 연결을 유지한다. 삭제 명령은 지울 ID만 연결에서 제외 | 정합 |
| ADR-074 | 새 리다이렉트 정책을 만들지 않고 PR1 helper를 사용 | 규칙 변경 없음 |
| PR1이 만든 README·SKILL·common 링크와 endpoint 색인 | setup·영역 기록으로 연결돼 있으며 이 PR이 복제하지 않음 | 변경 불필요 |

한국어 제목·본문의 표기와 의미를 직접 점검했다.
공통화 후보 없음: 인증·전송·공용 옵션 판정은 기존 책임 파일을 사용하고, 이번에 확인한 날짜·참여자·필드 보존 규칙은 post 영역에 남겼다.
다른 영역의 정책을 이 PR에서 추출하지 않았다.

## 정리와 남은 확인

임시 업무·댓글·파일·마일스톤·자기 전용 그룹을 삭제했고 제목 접두사 조회 결과가 비었다.
브라우저 작업 공간을 finish하고 임시 HOME과 키체인 항목을 지웠다.
Node가 사용한 실제 HOME 경로의 account 해시로 find-generic-password 종료 코드 44를 확인했다.

307의 실제 전송과 API 복구 뒤 응답 비교는 index.json의 deferred에 있다.
이번 완료 조건은 가짜 HTTP 검사·공식 문서 비교이며 API 복구를 기다리지 않는다.
독립 코드 리뷰와 같은 PR head의 CI 확인은 머지 전에 마친다.
