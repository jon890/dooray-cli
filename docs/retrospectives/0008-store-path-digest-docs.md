---
id: RETRO-0008
plan: 050-feat-managed-skill-store
date: 2026-07-23
phase: docs-verification
status: 해결
category: 결함
promotion: 승격 안 함
---

# 저장 경로 digest 표기의 구현 불일치

## 관찰

독립 문서 검증에서 일부 설계 문서가 저장 디렉터리명에 `sha256:` 접두사를 포함한 전체 `contentDigest`를 넣는 것처럼 표기한 사실을 발견했다.

## 원인

매니페스트 필드 이름과 경로에 사용하는 digest hex를 같은 placeholder로 표현했다.

## 영향

문서만 읽은 구현자나 운영자가 실제 `<packageVersion>-<64hex>` 경로와 다른 형식을 예상할 수 있었다.

## 대응

모든 경로 표기를 `contentDigestHex` 또는 `64hex`로 바꾸고, 매니페스트의 `sha256:` 접두사를 제거한 64자리 lowercase hex라고 정의했다.

## 검증

저장소 문서와 task의 경로 표기를 검색했고 독립 문서 재검증에서 `APPROVED`를 받았다.

## 배운 점

매니페스트 표현과 파일시스템 표현이 다르면 placeholder 이름도 분리해야 한다.

## 후속

문서 내부 표기 교정으로 닫히는 문제이므로 별도 지침으로 승격하지 않는다.
