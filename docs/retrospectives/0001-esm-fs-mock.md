---
id: RETRO-0001
plan: 049-feat-skill-lifecycle
date: 2026-07-23
phase: phase-01
status: 해결
category: 환경
promotion: 승격 안 함
---

# ESM 파일 시스템 모듈의 실패 경로 모의 처리

## 관찰

`node:fs/promises`의 `rename` 내보내기는 ESM 모듈 이름 공간에서 읽기 전용이므로 `vi.spyOn`으로 교체할 수 없었다.

## 원인

ESM 이름 공간의 속성은 재정의할 수 없지만, 테스트가 원자 전환 실패와 백업 복구를 검증하려면 두 번째 `rename` 호출만 의도적으로 실패시켜야 했다.

## 영향

초기 접근으로는 전환 실패 복구 경로를 재현할 수 없었다.
운영 코드는 영향을 받지 않았다.

## 대응

`vi.mock("node:fs/promises")`로 실제 모듈을 확장하고 `rename`만 모의 함수로 감쌌다.
테스트에서는 실제 `rename`, 의도한 실패, 실제 복구 `rename` 순서로 구현을 지정했다.

## 검증

`pnpm exec vitest run src/skill/manager.test.ts`에서 전환 실패 시 기존 파일이 원래 경로로 복구되는 테스트를 포함한 15개 테스트가 통과했다.

## 배운 점

ESM 기본 모듈의 실패 경로는 이름 공간 속성을 직접 감시하기보다 부분 모의로 주입하는 편이 안정적이다.

## 후속

현재 테스트 경계에만 필요한 해결이므로 공용 지침으로 승격하지 않는다.
