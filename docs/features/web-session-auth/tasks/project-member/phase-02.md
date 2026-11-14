# Phase 02. 인증 설정과 웹 HTTP 를 더한다

**Execution profile**: standard

## 목표

쿠키를 비밀값으로 보관하고 안전한 웹 요청과 방식별 설정 판정을 제공한다.

**범위 외**: project·member 명령·resolver 교체는 다음 phase.

## 컨텍스트

**요구사항**: REQ1, REQ2, REQ3, REQ4, REQ5, REQ9, REQ13, REQ15, REQ16, REQ11

**근거 문서**: `docs/features/web-session-auth/spec.md`, `docs/features/web-session-auth/design.md`

## 작업 항목

### 1. `web-auth.ts` 에 쿠키 파싱·웹 주소·완료 판정을 둔다. 기존 키체인 저장과 보안 검사에 sessionCookie 를 포함하고 API 방식에서는 쿠키 읽기를 생략하되 저장 시 보존한다.
### 2. 웹 HTTP 는 요청 origin 검사 후 SESSION 을 붙이고 리다이렉트를 차단한다. 토큰 버킷과 큰 정수 파서를 재사용한다. 오류·서버 메시지에서 호스트와 쿠키를 제거한다.
### 3. 캐시 비교에 방식·쿠키·웹 테넌트를 포함한다. API 방식 생략값은 api-key 와 같다.
### 4. `src/config/web-auth.test.ts`, `src/api/web/http.test.ts`, `src/services/config.test.ts` 에 정상·잘못된 쿠키, 다른 origin, 401/403/302/HTML/429/네트워크, 키체인·설정 완료·캐시 무효화 테스트를 작성한다.

### 5. 설정 명령과 안전한 주소 판정

CONFIG_SET_KEYS·setConfigValue·invalidConfigReason 에 auth-mode·session-cookie 를 연결한다. 잘못된 방식은 3, 쿠키는 parseSessionCookie 로 받는다. readAuthModeFromFile 은 파일만 읽는다. config get 의 쿠키는 설정됨/미설정만 보이고 API 방식에서도 명시 조회는 키체인을 직접 읽는다. base-url 은 https 를 검사한다. config set auth-mode web 저장 성공 뒤 한 번만 경고한다.
resolveWebBaseUrl 안에서도 ^[a-z0-9-]+$ 를 검사하고 만든 URL 의 hostname 이 기대 hostname 과 같은지 다시 검사한다. #, /, @, ?, . 가 든 테넌트 테스트를 더한다.

### 6. `src/config/store.keychain.test.ts`, `src/commands/config.test.ts`

API 방식에서 다른 키를 저장해도 생략해 읽은 키체인 쿠키를 지우지 않는다. 명시적인 session-cookie 저장만 그 비밀값을 바꾼다. 키체인 쿠키 보존과 직접 조회를 테스트한다. 웹 방식에서 쿠키 변경 캐시 무효화를 검증한다. 일반 명령에는 비공식 경고가 나오지 않는 것도 확인한다.

## 검증

```bash
# cwd: 저장소 루트
pnpm test
pnpm tsc --noEmit
pnpm run build
node scripts/check-pii.mjs
```

## 변경 파일

| 파일 | 변경 |
| --- | --- |
| `src/config/web-auth.ts` | 신규 |
| `src/config/web-auth.test.ts` | 신규 |
| `src/api/web/http.ts` | 신규 |
| `src/api/web/http.test.ts` | 신규 |
| `src/config/*.ts` | 수정 |
| `src/commands/config.ts` | 수정 |
| `src/commands/config.test.ts` | 수정 |
| `src/services/config.ts` | 수정 |
| `src/services/config.test.ts` | 수정 |
