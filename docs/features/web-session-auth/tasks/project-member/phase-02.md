# Phase 02. 인증 설정과 웹 HTTP 를 더한다

**Execution profile**: standard

## 목표

쿠키를 비밀값으로 보관하고 안전한 웹 요청과 방식별 설정 판정을 제공한다.

**범위 외**: 명령·resolver 교체는 다음 phase.

## 컨텍스트

**요구사항**: REQ1, REQ2, REQ3, REQ4, REQ5, REQ9, REQ13, REQ15, REQ16

**근거 문서**: `docs/features/web-session-auth/spec.md`, `docs/features/web-session-auth/design.md`

## 작업 항목

### 1. `web-auth.ts` 에 쿠키 파싱·웹 주소·완료 판정을 둔다. 기존 키체인 저장과 보안 검사에 sessionCookie 를 포함하고 API 방식에서는 쿠키 읽기를 생략하되 저장 시 보존한다.
### 2. 웹 HTTP 는 요청 origin 검사 후 SESSION 을 붙이고 리다이렉트를 차단한다. 토큰 버킷과 큰 정수 파서를 재사용한다. 오류·서버 메시지에서 호스트와 쿠키를 제거한다.
### 3. 캐시 비교에 방식·쿠키·웹 테넌트를 포함한다. API 방식 생략값은 api-key 와 같다.
### 4. `src/config/web-auth.test.ts`, `src/api/web-http.test.ts`, `src/services/config.test.ts` 에 정상·잘못된 쿠키, 다른 origin, 401/403/302/HTML/429/네트워크, 키체인·설정 완료·캐시 무효화 테스트를 작성한다.

## 검증

```bash
# cwd: 저장소 루트
pnpm test src/config src/services/config.test.ts src/api/web-http.test.ts
pnpm tsc --noEmit
pnpm run build
node scripts/check-pii.mjs
```

## 변경 파일

| 파일 | 변경 |
| --- | --- |
| `src/config/web-auth.ts` | 신규 |
| `src/config/web-auth.test.ts` | 신규 |
| `src/api/web-http.ts` | 신규 |
| `src/api/web-http.test.ts` | 신규 |
| `src/config/*.ts` | 수정 |
| `src/services/config.ts` | 수정 |
| `src/services/config.test.ts` | 수정 |
