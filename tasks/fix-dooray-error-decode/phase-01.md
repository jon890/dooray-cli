# Phase 1: normalizeDoorayMessage 유틸 추가 + client.ts 연동 + 빌드 검증

## 컨텍스트

dooray-cli는 TypeScript + Commander.js 기반 Dooray REST API CLI 도구. HTTP 클라이언트는 `ky`를 사용한다 (axios 금지 — CLAUDE.md 참조).

### 관련 이슈

GitHub Issue #6 — `fix(errors): decode URL-encoded Dooray API error messages before printing`

### 이전 커밋 상호작용

```bash
# cwd: /Users/nhn/personal/dooray-cli
git log --oneline -5
```

결과 (작성 시점):
```
29ca2a7 chore(gitignore): ignore .claude/worktrees/ for upcoming parallel work
b868838 chore: bump version to v0.5.1
4f0269b Merge pull request #2 from huneea/fix/resolve-private-project
71c6b7c chore: bump version to v0.5.0
cd60c1e chore(task): v0.5.0 task status 업데이트
```

이 task는 기존 커밋 구조와 독립적 — `src/api/client.ts:86-105`의 `toDoorayCliError` 함수 내부 메시지 정규화 1 지점만 영향.

### 문제 증상

Dooray API가 에러 응답의 `header.resultMessage`를 URL-encoded(+ 구분자 포함) 상태로 내려주는 경우가 있어, CLI가 그대로 출력:

```
오류: API 호출 실패: %EC%9E%85%EB%A0%A5%ED%95%9C+%EB%82%B4%EC%9A%A9%EC%97%90+%EC%98%A4%EB%A5%98%EA%B0%80+%EC%9E%88%EC%8A%B5%EB%8B%88%EB%8B%A4.
```

(디코딩: "입력한 내용에 오류가 있습니다.")

### 설계 결정 (사용자 합의)

- **Option C 채택**: 새 파일 `src/utils/dooray-message.ts`로 분리 — 추후 다른 에러/메시지 경로에서도 재사용 가능
- `+` → space 치환은 form-encoding 관례상 유지. 다만 ASCII 메시지에 의도된 `+`가 포함된 경우 공백으로 바뀌는 부작용 → **호출처에 주석으로 트레이드오프 명시**
- 디코딩 실패 시 `try/catch`로 원문 폴백 (malformed escape 방어)

## 목표

1. `src/utils/dooray-message.ts` 신규 파일에 `normalizeDoorayMessage` export
2. `src/api/client.ts:92` 의 `body.header.resultMessage` 를 정규화 통과 후 사용
3. 호출처에 `+` → space 치환 부작용 주석 추가
4. 빌드 통과 확인

## 작업 목록

### 1) 유틸 파일 신규 생성

파일 경로: `src/utils/dooray-message.ts`

```ts
/**
 * Dooray API의 `header.resultMessage`는 URL-encoded (form-encoded) 상태로
 * 내려오는 경우가 있어, 출력 전에 사람이 읽을 수 있는 형태로 정규화한다.
 *
 * - `+` 는 form-encoding 관례에 따라 공백으로 치환 후 디코딩
 * - 디코딩 실패(malformed escape)시 원문 그대로 반환
 */
export function normalizeDoorayMessage(raw: string): string {
  try {
    return decodeURIComponent(raw.replace(/\+/g, " "));
  } catch {
    return raw;
  }
}
```

### 2) client.ts 연동

파일 경로: `src/api/client.ts`

- top import 블록에 `import { normalizeDoorayMessage } from "../utils/dooray-message.js";` 추가 (기존 `DoorayCliError` import 아래)
- `toDoorayCliError` 함수 내부 `body.header.resultMessage` 사용처(L92-95)를 아래로 교체:

```ts
// NOTE: form-encoding 관례로 `+`를 공백으로 치환한다.
// Dooray resultMessage에 의도된 `+`가 포함된 경우 공백으로 바뀌는 부작용이
// 있으나, 실측된 메시지는 대부분 한국어 설명문이라 수용 가능한 트레이드오프.
throw new DoorayCliError(
  `API 호출 실패: ${normalizeDoorayMessage(body.header.resultMessage)}`,
  exitCode,
);
```

### 3) 빌드 검증

```bash
# cwd: /Users/nhn/personal/dooray-cli
pnpm run build
```

### 4) 정적 검증 (grep)

```bash
# cwd: /Users/nhn/personal/dooray-cli

# 신규 파일 존재 확인
test -f src/utils/dooray-message.ts && echo OK

# export 확인
grep -n "export function normalizeDoorayMessage" src/utils/dooray-message.ts

# client.ts import 확인
grep -n "normalizeDoorayMessage" src/api/client.ts

# 원본 코드(정규화 없는 raw 사용)가 남아있지 않은지 확인
# — 호출처가 normalizeDoorayMessage로 감싸졌는지 diff로 확인
git diff src/api/client.ts | grep -E "^\+.*resultMessage"
```

### 5) 기능 검증 (번들 레벨 smoke)

```bash
# cwd: /Users/nhn/personal/dooray-cli

# 빌드 산출물에 함수가 포함되었는지
grep -c "normalizeDoorayMessage\|decodeURIComponent" dist/index.js
```

## 성공 기준

- [ ] `pnpm run build` 성공 (exit 0)
- [ ] `test -f src/utils/dooray-message.ts` 통과
- [ ] `grep "export function normalizeDoorayMessage" src/utils/dooray-message.ts` → 1줄 매치
- [ ] `grep "normalizeDoorayMessage" src/api/client.ts` → 2줄 매치 (import + 호출)
- [ ] `grep -c "decodeURIComponent" dist/index.js` → 1 이상 (기존 파일명 디코딩 + 신규 메시지 디코딩 포함)
- [ ] `git diff src/api/client.ts` 에 기존 raw `body.header.resultMessage` 사용 줄이 `-`로 표시되고, `normalizeDoorayMessage(...)` 가 `+`로 표시됨

## 주의사항

- **HTTP 클라이언트 변경 금지** — ky 그대로 유지 (CLAUDE.md: axios 금지)
- **exitCode 로직 변경 금지** — 기존 `EXIT_API_ERROR`/`EXIT_AUTH_ERROR` 분기 유지
- **import 경로는 `.js` 확장자 사용** — 기존 컨벤션 (`../utils/errors.js` 등) 일치
- 주석은 호출처(`client.ts`)에 "왜 `+` → space 치환이 부작용을 감수하는지" 한 블록만. util 파일 내부 docstring은 동작 설명 위주로 간결하게

## Blocked 조건

- pnpm/Node.js 18+ 미설치 → `PHASE_BLOCKED: Node.js 18+ / pnpm 필요`
- `src/api/client.ts` 의 L92 구조가 크게 달라져서 patch가 직접 적용 불가 → `PHASE_BLOCKED: client.ts 구조 변경 감지 — 수동 검토 필요`
