# 웹 방식 post 명령의 인수 검증 계획

## 준비와 실행 범위

PR1 머지 알림을 받고 main을 합친 뒤, 이 영역의 구현·로컬 검사·코디네이터의 독립 검토를 마친다.
아래 표의 선행 조건은 이 준비가 끝난 뒤 이번 PR에서 추가로 필요한 조건이다.
SESSION은 로그인된 ego 브라우저의 CDP Network.getCookies로 읽어 임시 HOME의 설정에 stdin으로 입력한다.
macOS에서는 그 설정 경로의 키체인 항목을 사용한다.
실제 사용자 설정은 수정하지 않는다.
쿠키·호스트·실명·실제 ID를 출력하거나 저장하지 않고, 브라우저 오류도 코드만 기록한다.
명령은 하나씩 직렬로 실행하고 요청 간격은 토큰 버킷과 응답 헤더에 맡긴다.
401·429면 요청을 멈추고 코디네이터에게 묻는다.

쓰기 장소는 코디네이터 지시서가 지정한 프로젝트다.
장소가 지정되지 않았으면 쓰기 전에 멈춘다.
업무 제목은 [cli-web-probe]로 시작하고 담당·참조에는 자신 또는 자기만 포함된 실측 그룹을 넣는다.
필드 보존 검증용 임시 단계와 자기 전용 그룹의 생성·삭제는 추가 승인 범위에서만 실행한다.
그룹 code에 대괄호가 허용되지 않아 cli-web-probe-self로 정규화하는 것도 승인된 예외다.
기존 단계·그룹과 기존 업무는 읽기만 한다.
실측 직후 만든 업무·댓글·첨부·단계·그룹을 삭제한다.
삭제에 실패하면 바로 코디네이터에게 묻는다.

검증 결과의 참·거짓과 필드 이름만 기록한다.
실제 응답을 고정 fixture로 저장하지 않는다.

## 인수 검증 계획

| 요구사항 | 준비 조건 | 실행 절차 | 기대 결과 | 실행 환경 | 실행 담당 | 선행 조건 | 시점 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| REQ6 | 자기 임시 업무 | post list/get/search를 일반·json·quiet로 실행하고 공식 필드 표와 비교 | ID 문자열·참조 객체·시간대 유지, fileIdList 유지, 내부 필드 제외 | 임시 HOME과 로그인된 웹 세션 | worker | 없음 | PR 전 |
| REQ6 | 서로 다른 생성 시각의 임시 댓글 | post comment list/get/latest와 list의 asc·desc·page·latest·since를 비교 | page별 댓글 구분, 오름차순 정렬 일치, 최신 조회가 최신 구간만 요청, 중복·무한 조회 없음 | 같은 임시 환경 | worker | 없음 | PR 전 |
| REQ6 | 실측 구조를 본뜬 가짜 응답 | 업무의 dueDate·startedAt·endedAt, 댓글의 createdAt·modifiedAt, 파일의 createdAt를 필드별로 검사 | 실측의 오프셋 형식을 입력으로 사용, 파일 +HHmm를 +HH:mm으로 변환, null과 누락 구분 | 가짜 HTTP | worker | 없음 | PR 전 |
| REQ7 | 자기 담당자·참조자와 임시 그룹·단계 | create의 milestone·due-date·priority·cc·to-group·cc-group·tag·workflow를 옵션별로 실행하고 상세 재조회 | 옵션 표의 대응 필드가 남음, 중복 참조 제외는 서버 동작과 일치 | 같은 임시 환경 | worker | 없음 | PR 전 |
| REQ7 | 태그·단계·만기일·참여자·첨부가 있는 임시 업무 | post replace, 본문만 바꾸는 edit, edit의 to·cc·tag 추가·삭제·clear를 실행 | 요청하지 않은 필드 보존, 명시적으로 지운 배열만 비워짐, 본문과 제목 변경 성공 | 같은 임시 환경 | worker | 없음 | PR 전 |
| REQ7 | 임시 상위·하위 업무 | create --parent, edit --parent, workflow, done을 실행하고 상세 재조회 | 같은 프로젝트에서 상위 연결·전체 상태·완료일이 바뀜, 다른 프로젝트로 이동하지 않음 | 같은 임시 환경 | worker | 없음 | PR 전 |
| REQ7 | 읽을 수 있는 기존 템플릿 | 다른 사람의 멘션·참조가 없는지 먼저 보고 create --template에 자기 담당자·본문 명시 | 기존 우선순위 유지. 안전한 템플릿이 없으면 생성을 건너뛰고 이유 기록, 템플릿 새로 만들지 않음 | 같은 임시 환경 | worker | 없음 | PR 전 |
| REQ6, REQ7 | 파일 연결이 있는 임시 댓글 | comment add/edit/delete와 comment file upload/list/download/delete 실행 | 본문만 수정해도 기존 첨부 카드 연결 유지, 원본 바이트 일치, 삭제 후 연결·파일 제거 | 같은 임시 환경 | worker | 없음 | PR 전 |
| REQ4, REQ7 | 일반 파일·본문 이미지·댓글 첨부 | file upload/list/download/download-all/delete 실행 | 목록·상세·댓글 단건의 소속 근거 일치, 원본 바이트 일치, 업무 밖 파일 제외 | 같은 임시 환경 | worker | 없음 | PR 전 |
| REQ3, REQ4, REQ9 | PR1 전송 helper와 가짜 서버 응답 | `src/api/post/web-file.test.ts`로 직접 200·허용 307·외부 307·재리다이렉트·로그인 302·HTML 200 검사 | 외부 호스트에 쿠키 없음, 세션 만료는 종료 코드 2와 안내, URL·비밀값 노출 없음 | 가짜 HTTP와 임시 파일 | worker | 없음 | PR 전 |
| REQ8, REQ17 | 방식별 설정 대역 | `src/commands/post/web-support.test.ts`에서 실제 지원 경로와 미지원 경로 판정·가이드 표 비교, API 키 방식 직접 판정 | 아직 지원하지 않는 경로는 호출 전 종료 코드 3, API 키 방식 통과, 실제 사용자 설정 미조회 | 가짜 HTTP와 임시 설정 | worker | 없음 | PR 전 |
| REQ9 | 만료·권한 실패의 가짜 응답 | 업무·댓글 읽기와 쓰기에 401·403 주입 | 401 쿠키 재입력 안내, 403 권한 안내, 종료 코드 2 유지 | 가짜 HTTP | worker | 없음 | PR 전 |
| REQ6, REQ7 | 전체 구현 | phase-03의 테스트·타입·빌드·패키지·공개 문서 검사 실행 | 검사 통과, 기존 API 키 방식 회귀 없음. api:inventory는 웹 지원의 증거로 세지 않음 | 작업 워크트리 | worker | 없음 | PR 전 |
| REQ6, REQ7, REQ8 | PR과 검증 증거 | 독립 검토 결과와 같은 head의 CI 확인 | 필수 검사·독립 검토 통과, 미해결 리뷰 없음 | GitHub PR | 코디네이터 | push | PR 뒤 |

## 정리와 증거

업무는 실측 기록의 DELETE /posts/{number}로 하위부터 삭제한다.
댓글·첨부·임시 단계·임시 그룹도 실측 기록의 경로로 지운 뒤 목록에서 사라진 것을 확인한다.
제목 접두사 조회 결과가 비었는지 확인한다.
작업 공간을 finish하고 임시 HOME을 지운다.
설정 경로 해시의 키체인 항목을 지운 뒤 find-generic-password 종료 코드 44를 확인한다.
PR 본문에 옵션별 실행 명령·필드 비교·생략 필드·정리 결과와 그룹 이름을 정규화한 이유를 적는다.
지우지 못한 항목이 있으면 PR 본문에도 남긴다.
307 실제 전송과 API 복구 뒤 실제 응답 비교는 index.json의 deferred로 관리한다.
