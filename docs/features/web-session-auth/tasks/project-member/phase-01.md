# Phase 01. Web 경로와 공식 응답을 확인한다

**Execution profile**: standard

**상태**: completed (32084b0). 쓰기 실측과 웹 정리를 마쳤다. 다시 쓰지 않는다.

## 목표

구현 전에 PR1 웹 경로의 쿼리·페이지 넘기기·쓰기 조건과 공식 응답 필드를 기록한다.

**범위 외**: post·wiki·messenger·calendar·stream.

## 컨텍스트

**요구사항**: REQ6, REQ7

**근거 문서**: `docs/features/web-session-auth/spec.md`, `docs/features/web-session-auth/design.md`

## 작업 항목

### 1. 로그인된 ego 브라우저의 CDP 로 SESSION 을 읽되 출력하거나 파일에 저장하지 않는다. 메모리의 값만 붙인 Node 요청으로 쿼리와 서로 다른 페이지를 확인한다.
### 2. 공식 API 문서를 브라우저로 읽고 응답 필드를 기록한다. 실제 식별자는 기록하지 않는다.
### 3. 코디네이터 지시서가 준 프로젝트(없으면 멈춘다)에서 새 임시 그룹의 태그만 생성·수정한다. 마지막에 웹 화면에서 태그와 그룹을 삭제하고 확인한다. 다른 쿠키가 필요하면 멈춘다.
### 4. 웹 경로·변환·누락 필드를 `docs/api/web-endpoints.md` 에 기록한다.

## 검증

```bash
# cwd: 저장소 루트
node scripts/check-pii.mjs
node scripts/check-public-refs.mjs
```

## 변경 파일

| 파일 | 변경 |
| --- | --- |
| `docs/api/web-endpoints.md` | 수정 |
