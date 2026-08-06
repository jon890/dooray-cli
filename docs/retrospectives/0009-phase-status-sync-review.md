---
id: RETRO-0009
plan: 051-fix-comment-file-reference
date: 2026-08-06
phase: code-review
status: 해결
category: 결함
promotion: 승격 안 함
---

# 단계 상태 표기 불일치

## 관찰

코드 검토자가 `index.json`의 완료 상태와 두 단계 문서 헤더의 `pending` 상태가 충돌한다고 판정했다.

## 원인

마지막 단계에서 `index.json`만 완료 처리하고 단계 문서의 사람이 읽는 상태 표기를 함께 갱신하지 않았다.

## 영향

구현 동작에는 영향이 없지만 작업 진행 상태를 읽는 사람에게 상충하는 정보를 제공한다.

## 대응

두 단계 문서 헤더를 완료 상태로 맞춘다.

## 검증

`rg`로 `index.json`의 두 단계와 `phase-01.md`, `phase-02.md`가 모두 `completed`임을 확인했다.

## 배운 점

완료 상태 검증은 구조화 상태 파일뿐 아니라 단계 문서의 표시 상태까지 대조해야 한다.

## 후속

독립 코드 재검토에서 최종 판정을 받는다.
