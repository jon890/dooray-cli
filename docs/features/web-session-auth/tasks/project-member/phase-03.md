# Phase 03. Project·member 와 setup·doctor 를 웹 방식에 연결한다

**Execution profile**: standard

## 목표

지원 명령을 웹 클라이언트에 연결하고 아직 옮기지 않은 명령을 호출 전에 막는다.

**범위 외**: 뒤 PR 영역의 웹 메서드 구현, 머지·배포·릴리스.

## 컨텍스트

**요구사항**: REQ6, REQ7, REQ8, REQ10, REQ11, REQ12, REQ17

**근거 문서**: `docs/features/web-session-auth/spec.md`, `docs/features/web-session-auth/design.md`

## 작업 항목

### 1. 공개 메서드와 같은 DoorayClient 인터페이스·createClient 를 더하고 웹 구현을 별도로 둔다. 공개 구현 동작은 바꾸지 않는다.
### 2. PR1 메서드의 공식 필드를 채우고 응답 구조를 검증한다. 프로젝트 멤버를 메모리에 재사용한다. 없는 메서드는 API 를 부르지 않고 실패시킨다.
### 3. commands 의 생성자와 resolver·services·editor 매개변수 타입을 교체한다. mock 생성자는 API 방식 기존 테스트가 계속 쓸 수 있게 둔다.
### 4. web-support 와 preAction 을 추가한다. `member get --with-org` 는 다른 영역 웹 호출을 필요로 하므로 미지원 옵션으로 막는다. 문서 목록과 코드 목록을 테스트로 대조한다.
### 5. setup 은 첫 질문으로 방식을 받고 기존 다른 방식 비밀값을 보존한다. 401 은 쿠키 재입력, 설정 오류는 테넌트 재입력, 나머지는 종료한다. doctor 는 캐시 없이 getMe 로 연결을 검사한다.
### 6. 설정 명령과 setup 의 경고, doctor 경고, 문서·스킬 사용법을 갱신한다. 임시 HOME 에 stdin 으로 쿠키를 저장해 CLI 실측 후 키체인 경로별 항목과 임시 HOME 을 지운다.

### 7. `src/api/web-client.test.ts`, `src/commands/web-support.test.ts`, `src/commands/setup.test.ts`, `src/commands/doctor.test.ts`

변환 필드·페이지 넘기기·미지원 명령과 옵션·setup 재입력·doctor 만료 오류를 검증한다.

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
| `src/api/dooray-client.ts` | 신규 |
| `src/api/web-client.ts` | 신규 |
| `src/api/web-client.test.ts` | 신규 |
| `src/commands/web-support.ts` | 신규 |
| `src/commands/web-support.test.ts` | 신규 |
| `src/api/client.ts` | 수정 |
| `src/commands/**/*.ts` | 수정 |
| `src/resolvers/*.ts` | 수정 |
| `src/services/tag.ts` | 수정 |
| `src/editor/index.ts` | 수정 |
| `src/index.ts` | 수정 |
| `docs/api/web-endpoints.md` | 수정 |
| `docs/adr/081-web-session-auth.md` | 수정 |
| `docs/adr/042-cache-invalidation-on-mutation.md` | 수정 |
| `docs/code-architecture.md` | 수정 |
| `docs/data-schema.md` | 수정 |
| `docs/guide/setup.md` | 수정 |
| `README.md` | 수정 |
| `skills/dooray-cli/**` | 수정 |
| `CLAUDE.md` | 수정 |
