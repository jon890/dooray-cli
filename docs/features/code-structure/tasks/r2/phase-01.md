# Phase 01. 공개 구현 분할과 메일 파일 이동

**Execution profile**: standard

## 목표

`api/client.ts` 의 공개 구현을 영역별 `public.ts` 로 나누고, 메일 파일을 `api/mail/` 로 옮긴다.
공개 메서드 이름·시그니처, `DoorayApiClient(apiKey, baseUrl)` 생성자, 도움말과 동작은 그대로다.

**범위 외**: utils 재분류, `body/`, mail id → UID 풀이 분리, attachment-check 정리(R3). 명령 파일 로직 분리와 resolver 의 `DoorayClient` 의존 제거(R4).

## 컨텍스트

**요구사항**: REQ1, REQ2, REQ3, REQ4, REQ8

**근거 문서**: `docs/features/code-structure/design.md` 「공개 구현의 꼴 (R2)」, 「R1·R2 에서 정할 것」, `docs/adr/082-code-structure.md`

## 의도 메모

- 영역 구현은 `create<영역>Public(http: PublicHttp): <영역>Client` 로 객체 리터럴을 돌려준다. 같은 영역의 다른 메서드를 부르는 `downloadPostFile`·`downloadWikiPageFile` 은 영역 안의 `client` 상수를 거친다.
- 파일 서버 요청·다운로드 리다이렉트는 `PublicHttp` 의 메서드로 둔다. 영역 사이에서 공유하는 것은 이 둘과 오류 변환뿐이다.
- 인벤토리 스크립트가 읽는 호출 꼴은 `http.api.<메서드>(…)` 와 `http.url(…)` 로 정했다.
- 메일 이동은 `scripts/move-paths.mjs` 의 move → rewrite 두 단계로 하고 커밋을 나눈다.

## 작업 항목

### 1. `getAllWikiPages` 를 `api/wiki/pages.ts` 의 `collectWikiPages` 로 바꾼다
### 2. `PublicHttp`, 영역별 `public.ts`, `createPublicClient`, `DoorayApiClient` 를 만들고 `client.ts` 를 재내보내기로 줄인다
### 3. 비공개 필드 `api` 를 바꿔 끼우던 테스트 셋을 `createPublicClient(new PublicHttp(…, fakeKy))` 로 바꾸고, 공개 영역 메서드 이름 충돌 검사를 더한다
### 4. 인벤토리 스크립트와 테스트를 새 호출 꼴과 파일 범위로 고친다
### 5. 메일 파일 4개와 짝 테스트를 move → rewrite 로 옮긴다
### 6. `resolvers`·`services` 의 `api/dooray-client.ts` import 규칙을 더하고 문서 경로를 맞춘다

## 검증

```bash
# cwd: 저장소 루트
pnpm tsc --noEmit
pnpm test
pnpm run build && node scripts/help-snapshot.mjs --check <기준 파일>
pnpm api:inventory
```

## 변경 파일

| 파일 | 변경 |
| --- | --- |
| `src/api/public/{http,index}.ts` | 신규 |
| `src/api/<영역>/public.ts` | 신규 (project, member, post, wiki, messenger, calendar, stream) |
| `src/api/wiki/pages.ts` | 신규 |
| `src/api/client.ts` | 재내보내기만 남김 |
| `src/api/mail/*` | `imapClient`·`smtpClient`·`mailErrors`·`utils/mail-attachment-name` 이동 |
| `scripts/api-endpoint-inventory.mjs` | 읽는 파일과 호출 꼴 변경 |
| `src/architecture.test.ts`, `docs/code-architecture.md` | 규칙 추가 |
