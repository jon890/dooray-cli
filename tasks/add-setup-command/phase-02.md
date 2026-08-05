# Phase 2: setup 커맨드 구현

## 컨텍스트

dooray-cli는 TypeScript + Commander.js 기반 Dooray REST API CLI 도구이다.
프로젝트 구조는 `docs/code-architecture.md`, 사용자 흐름은 `docs/flow.md`, 기술적 결정은 `docs/adr.md`의 ADR-016을 읽어 파악하라.

Phase 1에서 `@inquirer/prompts`가 설치되었고, `src/config/types.ts`에 `tenantName`, `API_ENDPOINTS` 상수가 추가된 상태이다.

기존 커맨드 패턴은 `src/commands/config.ts`나 `src/commands/doctor.ts`를 참고하라.
API 연결 테스트 패턴은 `src/commands/doctor.ts`를 참고하라.

## 목표

`src/commands/setup.ts`에 `dooray setup` 대화형 초기 설정 마법사를 구현한다.

## 상세 플로우

### 1. 테넌트명 입력
- `@inquirer/prompts`의 `input` 사용
- 기본값: 기존 config의 `tenantName` 또는 `"<tenant>"`
- 안내 메시지: "Dooray 접속 URL에서 확인 가능: https://{tenant}.dooray.com"

### 2. API Endpoint 선택
- `@inquirer/prompts`의 `select` 사용
- `API_ENDPOINTS` 상수의 4개 항목을 선택지로 표시
- 각 선택지에 name(환경명)과 value(URL)를 표시
- 기본값: 기존 config의 `baseUrl`에 해당하는 항목 또는 "민간 클라우드"

### 3. API Key 입력
- `@inquirer/prompts`의 `password` 사용 (마스킹)
- 안내 메시지에 API Key 발급 링크 포함: `https://{tenantName}.dooray.com/setting/api/token`
  - tenantName은 1단계에서 입력받은 값 사용
- 기본값 없음 (보안상 기존 키를 표시하지 않음)

### 4. API 연결 테스트
- `DoorayApiClient`를 생성하여 `getProjects({ page: 0, size: 1 })` 호출
- `ensureMe(client)`로 사용자 이름 조회
- 성공 시: `✓ API 연결 성공 (홍길동)` 출력
- 실패 시: `✗ 연결 실패 — API Key를 확인해주세요` 출력 후 API Key 재입력 유도 (반복)

### 5. 메일 사용 여부
- `@inquirer/prompts`의 `confirm` 사용
- "메일 기능을 사용하시겠습니까?" (기본값: 기존 config에 imapUsername이 있으면 true, 없으면 false)

### 6. 메일 설정 (5에서 Y인 경우만)
- IMAP 사용자 이메일: `input` (안내: `https://{tenantName}.dooray.com/setting/mail/general/read`)
  - 기본값: 기존 config의 `imapUsername`
- IMAP 비밀번호: `password` (마스킹)
  - 기본값 없음 (보안)

### 7. 저장
- 모든 입력을 메모리에 수집한 뒤, 마지막에 config.json에 한 번에 저장 (all-or-nothing)
- Ctrl+C로 중간 취소 시 config 파일이 변경되지 않아야 함
- 저장 후: `✓ 설정 완료. dooray doctor로 상태를 확인할 수 있습니다.` 출력

## 작업 목록

- [ ] `src/commands/setup.ts` 파일 생성
- [ ] Commander.js Command로 `setup` 커맨드 정의
- [ ] 위 플로우 1~7 구현
- [ ] 기존 config가 있을 경우 해당 값을 기본값으로 사용
- [ ] Ctrl+C (ExitPromptError 등) 처리 — 저장하지 않고 "설정이 취소되었습니다." 출력 후 종료
- [ ] `pnpm run build` 성공 확인

## 성공 기준

- `pnpm run build` 성공
- `node dist/index.js setup --help` 정상 출력
- setup 커맨드가 대화형으로 동작 (테넌트명 → endpoint → API key → 연결 테스트 → 메일)

## 주의사항

- config 저장은 기존 `src/config/store.ts`의 함수를 활용하되, 개별 key별 저장이 아닌 전체 config 객체를 한 번에 저장하는 방식이 필요할 수 있음. 기존 `setConfigValue`는 key별 저장이므로, 전체 저장용 함수가 필요하면 `store.ts`에 `saveConfig(config: Config)` 함수를 추가
- `@inquirer/prompts`의 import 방식에 주의. ESM/CJS 이슈가 있으면 dynamic import (`await import(...)`) 사용
- 에러 처리는 `DoorayCliError` 패턴을 따름
- chalk로 색상 출력 (green: 성공, red: 실패, yellow: 안내)

## Blocked 조건

`@inquirer/prompts` 패키지가 설치되지 않은 경우: `PHASE_BLOCKED: @inquirer/prompts 패키지가 필요합니다. pnpm add @inquirer/prompts 실행`
