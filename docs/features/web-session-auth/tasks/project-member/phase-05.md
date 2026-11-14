# Phase 05. 초기 설정과 진단에서 웹 인증을 안내한다

**Execution profile**: standard

## 목표

초기 설정과 진단에서 웹 인증을 안내한다.

**범위 외**: 뒤 PR 의 웹 명령 구현.

## 컨텍스트

**요구사항**: REQ10, REQ11, REQ12, REQ16

**근거 문서**: `docs/features/web-session-auth/spec.md`, `docs/features/web-session-auth/design.md`

## 작업 항목

### 1. setup·doctor

첫 질문은 인증 방식이다. 웹이면 주소를 먼저 검증하고 쿠키를 가려 받는다. 401 과 형식 오류 3 은 쿠키를 다시 묻고 설정 오류 4 는 테넌트를 다시 묻는다. 403·기타 오류는 안내하고 종료한다. 다른 방식 비밀값을 보존한다. doctor 는 isConfigComplete 와 getMe 직접 호출을 쓰고 오류 안내를 유지한다. API 키 없음은 웹 방식 실패가 아니다.

### 2. `src/commands/setup.test.ts`, `src/commands/doctor.test.ts`

setup 테스트는 ../services/config.js 의 replaceConfig 와 ../api/dooray-client.js 의 createClient 를 mock 한다. 실제 저장 테스트는 store.fs.test.ts 처럼 가짜 홈과 getSecretStore: () => null 을 쓴다. 실제 ~/.dooray·키체인은 테스트하지 않는다. 일반 명령 경고 없음·켜는 순간 한 번 경고도 확인한다.

### 3. 가이드와 공식 응답의 차이

README·setup 가이드·번들 스킬에 웹 방식과 비공식 API 경고를 적는다. setup 가이드에 지원하지 않는 명령·옵션과 명령별 빠지는 필드를 적는다. code-architecture·data-schema·ADR-042 의 인증·캐시 설명을 맞춘다.

쿠키 재입력 회귀 사례로 Cookie: 헤더에 SESSION 이 없는 단일 쿠키도 거절한다. API 방식의 명시적인 쿠키 변경은 저장 전 쿠키만 따로 조회해 캐시 무효화에 반영하며 다른 설정 조회는 쿠키 키체인을 읽지 않는다. web-auth.test.ts·services/config.test.ts·config.test.ts 로 검증한다.

### 4. PR 전 CLI 실측

실측 장소는 코디네이터 지시서가 준 프로젝트이며 없으면 멈춘다. mktemp -d 로 만든 임시 HOME 에 HOME=<임시> node dist/index.js config set session-cookie - 를 실행하고 stdin 으로만 쿠키를 보낸다. 쿠키는 출력·로그·별도 파일에 저장하지 않는다. 실제 응답·이름·id·프로젝트 코드는 PR 본문·문서에 붙이지 않는다.
읽기 명령은 project list, project members <project>, project workflows <project>, project tags list <project>, project groups <project>, project templates <project>, member list <project>, member get <memberId>, member search <name> 을 --json 으로 실행하고 출력은 메모리에서 검증한 결과만 보고한다. 가짜 쿠키는 요청이 없는 config get·preAction 이 막는 post list 만 쓴다.
앞에서 끝낸 쓰기 실측을 다시 하지 않는다. CLI 쓰기 증거가 추가로 필요하면 새 임시 그룹에서 project tags create 와 project tags group 만 수행하고 웹 화면으로 지운다. PR 전 시점은 사용자가 허용했다.
끝나면 임시 HOME 을 지우고 /usr/bin/security delete-generic-password -s dooray-cli -a sessionCookie:<경로해시> 를 실행한다. find-generic-password 출력을 버리고 종료 코드 44 를 확인한다. 다른 임시 경로별 항목이 생겼다면 같은 방식으로 지운다.

## 검증

```bash
# cwd: 저장소 루트
pnpm test
pnpm tsc --noEmit
pnpm run build
pnpm api:inventory
pnpm verify:package
node scripts/check-pii.mjs
node scripts/check-public-refs.mjs
```

## 변경 파일

| 파일 | 변경 |
| --- | --- |
| `src/commands/setup.ts` | 수정 |
| `src/commands/setup.test.ts` | 수정 |
| `src/commands/doctor.ts` | 수정 |
| `src/commands/doctor.test.ts` | 수정 |
| `src/config/web-auth.ts` | 수정 |
| `src/config/web-auth.test.ts` | 수정 |
| `src/services/config.ts` | 수정 |
| `src/services/config.test.ts` | 수정 |
| `src/commands/config.ts` | 수정 |
| `docs/adr/042-cache-invalidation-on-mutation.md` | 수정 |
| `docs/code-architecture.md` | 수정 |
| `docs/data-schema.md` | 수정 |
| `docs/guide/setup.md` | 수정 |
| `README.md` | 수정 |
| `skills/dooray-cli/**` | 수정 |
| `CLAUDE.md` | 수정 |
