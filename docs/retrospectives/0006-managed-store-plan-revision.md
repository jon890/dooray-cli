---
id: RETRO-0006
plan: 050-feat-managed-skill-store
date: 2026-07-23
phase: critic-gate
status: 해결
category: 프로세스
promotion: 승격 안 함
---

# 관리 저장소 복구·해시 계약의 구현 전 모호성

## 관찰

구현 전 비판 검토에서 해시 길이 인코딩과 경계 바이트, 같은 canonical 저장소의 강제 복구, `modified`·`corrupt` 분류, `dataRoot` 주입 타입이 구현자가 추측해야 하는 수준으로 남아 있었다.

## 원인

초기 계획은 개념적 안전성에는 합의했지만 바이트 단위 직렬화와 저장 경로 충돌처럼 구현 단계에서만 드러나는 세부 상태 전이를 완전히 명시하지 않았다.

## 영향

구현체마다 다른 digest를 만들거나, 수정된 canonical 저장소를 `--force`로도 복구하지 못하거나, 상태 토큰이 흔들릴 수 있었다.

## 대응

해시 domain prefix·경계 바이트·64-bit big-endian 길이 프레임을 고정했다.
canonical 저장소 충돌은 기본 보존·실패, `--force` 격리·staging 전환·실패 복구로 정의했다.
상태 분류 표와 optional `dataRoot` 필드를 문서와 task에 추가했다.

## 검증

수정된 문서와 task를 다시 제출해 critic `APPROVED` 판정을 받았고 `git diff --check`와 task 검증을 통과했다.

## 배운 점

콘텐츠 주소 저장소 계획은 알고리즘 이름만으로 충분하지 않으며 바이트 프레임과 동일 경로 충돌 복구까지 계약으로 고정해야 한다.

## 후속

이번 계획의 구현·fixture 테스트로 고정하므로 별도 전역 지침으로 승격하지 않는다.
