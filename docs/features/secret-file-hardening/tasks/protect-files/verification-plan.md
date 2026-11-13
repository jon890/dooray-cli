# 파일 보호 인수 검증 계획

## 인수 검증 계획

| 요구사항 | 준비 조건 | 실행 절차 | 기대 결과 | 실행 환경 | 실행 담당 | 선행 조건 | 시점 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| REQ1, REQ9, REQ2, REQ5 | OS·mode·저장소 조합 | pnpm exec vitest run src/config/file-security.test.ts | 설계의 등급·필드 이름·안내와 일치 | macOS 로컬, mock 과 임시 디렉터리 | worker | 없음 | PR 전 |
| REQ1, REQ3 | 임시 HOME 과 가짜 저장소 | pnpm exec vitest run src/config/store.security.test.ts | 경고 한 번·억제·파일 내용 권한 mtime 불변·저장 뒤 fail 없음 | macOS 로컬, mock 과 임시 디렉터리 | worker | 없음 | PR 전 |
| REQ4, REQ10 | 설정 상태·연결 결과 mock | pnpm exec vitest run src/commands/doctor.test.ts | checks 상태와 종료 코드 일치, 스킬은 제외 | macOS 로컬, mock 과 임시 디렉터리 | worker | 없음 | PR 전 |
| REQ6, REQ7 | 임시 HOME 의 기존 캐시와 chmod 실패 mock | pnpm exec vitest run src/cache/store.test.ts src/cache/store.permissions.test.ts | 0700·0600, chmod 실패 시 성공하고 출력 없음 | macOS 로컬, mock 과 임시 디렉터리 | worker | 없음 | PR 전 |
| REQ8 | 실행 기록 없는 임시 HOME | pnpm exec vitest run src/cache/last-run.test.ts | 0700·0600, 동시 쓰기 JSON 유효, tmp 없음 | macOS 로컬, mock 과 임시 디렉터리 | worker | 없음 | PR 전 |
| REQ1, REQ2, REQ3 | 임시 HOME 의 0644 평문과 빈 baseUrl | 빌드 CLI project list 로 경고 확인 후 config set track-last-run false, 다시 project list; 테스트 경로 해시 키체인 항목 삭제 확인 | API 호출 없이 설정 미완료로 종료, 수정 전 경고·읽기 불변, 수정 뒤 경고 없음 | 실제 로그인 키체인과 임시 HOME | worker | 없음 | PR 전 |

## 실제 macOS CLI 확인

실행 환경: 실제 로그인 키체인과 임시 HOME.
실제 사용자 홈의 .dooray 는 읽거나 쓰지 않는다.
일회성 Python 검증 스크립트를 세션 임시 폴더에 만들고 다음 절차를 실행한다.

1. mkdtemp 로 임시 HOME 을 만들고 version 1, 가짜 apiKey, 빈 baseUrl, 0644 config.json 을 쓴다.
2. HOME 을 그 폴더로 주입한 node dist/index.js project list 가 경고 후 설정 미완료로 끝나는지 확인한다. 내용·권한·mtime 이 같은지도 확인한다.
3. 같은 HOME 으로 node dist/index.js config set track-last-run false 를 실행한다.
4. 같은 HOME 으로 node dist/index.js project list 에서 경고가 사라지고 설정 미완료로 끝나는지 확인한다.
5. security delete-generic-password -s dooray-cli -a apiKey:<config 경로 sha256 앞 16자> 로 테스트 항목을 지운다. find-generic-password 는 종료 코드 44 여야 한다. imapPassword 경로 해시 항목도 없음(44)을 확인한다.
6. 임시 HOME 을 지운다.

REQ5, REQ9 의 경고 없는 명령 경계는 src/config/store.security.test.ts 의 0600 평문과 비ASCII imapPassword 사례로 검증한다.
