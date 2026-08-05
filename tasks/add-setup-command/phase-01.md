# Phase 1: 의존성 설치 + Config 타입 확장

## 컨텍스트

dooray-cli는 TypeScript + Commander.js 기반 Dooray REST API CLI 도구이다.
프로젝트 구조와 기술 스택은 `docs/code-architecture.md`를 읽어 파악하라.
데이터 스키마는 `docs/data-schema.md`를 읽어 파악하라.
기술적 결정 사항은 `docs/adr.md`의 ADR-016을 읽어 파악하라.

이 프로젝트는 tsup(esbuild)으로 CJS 단일 번들을 생성한다. `tsup.config.ts` 또는 `package.json`의 tsup 설정을 확인하라.

## 목표

1. `@inquirer/prompts` 패키지를 설치하고 tsup CJS 번들에서 정상 동작하는지 확인
2. Config 타입에 `tenantName` 필드 추가
3. API Endpoint 선택지 상수 추가

## 작업 목록

- [ ] `pnpm add @inquirer/prompts` 실행
- [ ] `src/config/types.ts`에 `tenantName?: string` 필드 추가
- [ ] `src/config/types.ts`에 API_ENDPOINTS 상수 추가:
  ```typescript
  export const API_ENDPOINTS = {
    "민간 클라우드": "https://api.dooray.com",
    "공공 클라우드": "https://api.gov-dooray.com",
    "공공 업무망 클라우드": "https://api.gov-dooray.co.kr",
    "금융 클라우드": "https://api.dooray.co.kr",
  } as const;
  ```
- [ ] DEFAULTS에 `tenantName: "<tenant>"` 추가
- [ ] `src/config/store.ts`의 `setConfigValue`에 `tenant-name` 키 추가
- [ ] `pnpm run build` 실행하여 빌드 성공 확인
- [ ] `@inquirer/prompts`가 tsup 번들에서 정상 import되는지 확인. 만약 CJS 호환 문제가 있으면 tsup의 `external` 설정에 추가하거나 다른 방법으로 해결

## 성공 기준

- `pnpm run build` 성공
- `node dist/index.js --version` 정상 출력
- `@inquirer/prompts`가 빌드 에러 없이 포함됨

## 주의사항

- `@inquirer/prompts`가 ESM-only일 수 있음. tsup이 CJS로 번들링할 때 문제가 생기면 `external`로 빼고 node_modules에서 로드하도록 처리 (imapflow, mailparser와 동일 패턴)
- 기존 코드의 동작을 변경하지 말 것. 타입 추가와 의존성 설치만 수행

## Blocked 조건

Node.js 18+ 미설치 시: `PHASE_BLOCKED: Node.js 18 이상이 필요합니다`
