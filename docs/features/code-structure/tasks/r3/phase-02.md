# Phase 02. import 를 갱신하고 계층 의존을 정리한다

**Execution profile**: standard

## 목표

이동 뒤 import 와 문서 경로를 고치고 utils 의 상위 계층 의존을 없앤다.

**범위 외**: 사용자 동작 변경, R4 명령 나무 정리, 서버 호출.

## 컨텍스트

**요구사항**: REQ1, REQ5, REQ6, REQ7, REQ8

사용자 동작과 서버 호출은 그대로 유지한다. 실제 서버는 부르지 않고 기존 mock 테스트로 검증한다.
독립 코드·문서 리뷰는 코디네이터가 Claude 리뷰 worker 에게 맡긴다. 자체 검증을 독립 리뷰로 기록하지 않는다.

**근거 문서**: `docs/features/code-structure/design.md`

## 작업 항목

### 같은 표로 rewrite 를 실행하고 git diff --stat 을 임시 폴더에 보관한다.
### readStdin 을 utils/stdin.ts 로 분리하고 config-value 와 본문 입력이 가져오게 한다.
### mention 과 task-link 의 입력 타입을 body 안에 정의한다.
### sanitizeFileName 을 지우고 sanitizeForTerminal 을 직접 쓴다. 기존 검증 사례는 유지한다.
### feedback.ts 와 짝 테스트를 feedback/index.ts 로 옮긴다.
### mail id 조회의 후보 수집과 선택을 api/mail/uid-lookup.ts 로 옮기고 imap.ts 는 연결 수명과 기존 진입점을 유지한다.
### utils 허용 목록만 비우고 resolver 항목은 유지한다. IMAP 조회가 readline 에 기대지 않는 것을 확인한다.
### 코드 구조 문서와 이동 경로를 맞추고 인수 결과와 공통화 후보를 기록한다.

### 기존 본문 입력 테스트를 유지한다

`src/body/body-input.test.ts` 의 파일·stdin·오류 검증을 그대로 보존한다.

## 검증

verification-plan.md 의 명령을 실행한다. 기존 테스트 수가 줄지 않고 도움말 스냅숏이 같아야 한다.

```bash
pnpm tsc --noEmit
pnpm test
pnpm run build
pnpm api:inventory
pnpm verify:package
node scripts/check-pii.mjs
node scripts/check-public-refs.mjs
node scripts/check-doc-paths.mjs
```

## 변경 파일

| 파일 | 변경 |
| --- | --- |
| `src/**/*.ts` | 수정 (이동 대상 import 갱신) |
| `src/body/*.ts` | 신규·수정 (본문 규칙 분리) |
| `src/utils/stdin.ts` | 신규 |
| `src/utils/config-value.ts` | 수정 |
| `src/commands/feedback/*.ts` | 신규·수정 |
| `src/commands/mail/*.ts` | 수정 |
| `src/api/mail/imap.ts` | 수정 |
| `src/api/mail/uid-lookup.ts` | 신규 |
| `src/architecture.test.ts` | 수정 |
| `docs/**/*.md` | 수정 (이동 경로 갱신) |
| `CLAUDE.md` | 수정 (경로 갱신) |
| `skills/**` | 수정 (경로 갱신) |
| `docs/features/code-structure/**` | 신규·수정 (계획과 증거) |

| `src/body/body-input.test.ts` | 수정 (기존 입력 테스트 유지) |
