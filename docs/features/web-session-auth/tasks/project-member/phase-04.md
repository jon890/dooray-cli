# Phase 04. 지원하지 않는 명령을 API 호출 전에 막는다

**Execution profile**: standard

## 목표

지원하지 않는 명령을 API 호출 전에 막는다.

**범위 외**: 뒤 PR 의 웹 명령 구현.

## 컨텍스트

**요구사항**: REQ8, REQ17

**근거 문서**: `docs/features/web-session-auth/spec.md`, `docs/features/web-session-auth/design.md`

## 작업 항목

### 1. web-support 와 preAction

web-support/project.ts·member.ts 가 각 영역의 명령·미지원 옵션 목록을 소유하고 web-support.ts 는 목록을 모아 한 판정 함수로 처리한다. 뒤 영역도 자기 목록을 추가한다. 가이드 표는 영역별 절로 나눈다.

명령 경로·미지원 옵션의 원본을 src/commands/web-support.ts 에 둔다. member get --with-org 는 미지원으로 막고 설정·mail 은 통과시킨다. preAction 은 키체인 없이 파일만 읽는다.

### 2. `src/commands/web-support.test.ts`

지원 명령, 옵션, API 방식, mail, 가짜 쿠키의 CLI post list 가 API 호출 전 3 으로 끝나는지 확인한다. 가이드의 지원 표와 코드 목록을 대조한다.

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
| `src/commands/web-support.ts` | 신규 |
| `src/commands/web-support.test.ts` | 신규 |
| `src/commands/web-support/project.ts` | 신규 |
| `src/commands/web-support/member.ts` | 신규 |
| `src/index.ts` | 수정 |
| `docs/guide/setup.md` | 수정 |
