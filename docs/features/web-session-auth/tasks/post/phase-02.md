# Phase 02. 첨부 파일을 안전하게 주고받는다

**Execution profile**: standard

## 목표

웹 세션으로 첨부를 올리고 내려받되 인증 정보와 파일 소속을 보호한다.

**범위 외**: 공용 HTTP·신뢰 호스트 정책 변경, 위키와 메신저 첨부 구현.

## 컨텍스트

**요구사항**: REQ3, REQ4, REQ6, REQ7

**근거 문서**: `docs/features/web-session-auth/spec.md`, `docs/features/web-session-auth/design.md`, `docs/api/web-endpoints/post.md`, `docs/adr/074-file-redirect-hardening.md`, `docs/adr/067-attachment-file-name-decoding.md`

실측에서 업로드는 multipart의 file을 받아 직접 200으로 배열을 반환했다.
다운로드는 `/files/{fileId}`에서 직접 200으로 원본 바이트와 Content-Disposition을 반환했다.
307은 이번 환경에서 관측하지 못했으므로 실제 성공으로 기록하지 않고 가짜 HTTP 테스트로 검사한다.
기존 `src/api/client.ts`의 `isTrustedFileHost`, `parseContentDispositionFileName`, `fallbackFileName` 사용 방식을 먼저 읽고 PR1 웹 HTTP의 첨부 경계를 재사용한다.
공개 API의 기존 정책을 바꾸지 않는다.

## 의도 메모

- 파일 URL을 응답에서 받았다고 그대로 신뢰하지 않는다. 직접 다운로드 경로는 고정 경로와 인코딩한 파일 ID로 만든다.
- 업무의 첨부 목록이나 상세 참조에 없는 파일을 임의의 ID로 내려받지 않는다.
- 바이너리 응답을 JSON 파서에 넣지 않는다.
- 오류에는 쿠키·테넌트 주소·리다이렉트 URL을 넣지 않는다.

## 작업 항목

### 1. `src/api/post/web.ts`에 파일 메서드를 구현한다

`getPostFiles`, `getPostFileMeta`, `uploadPostFile`, `downloadPostFile`, `deletePostFile`를 구현한다.
목록의 `result.content`를 공식 배열로 바꾸고 공식 creator·날짜·파일 크기를 유지한다.
메타 조회는 목록의 항목을 골라 반환하고 없으면 파일 없음 오류를 낸다.
업로드는 `type=general`과 multipart의 file을 보내 배열에서 공식 `{id}`만 반환한다.
다운로드 전 파일 소속을 확인하고 직접 200의 원본 바이트를 반환한다.
파일 이름은 기존 안전한 이름 처리와 알려진 이름의 대체 순서를 재사용한다.

307이면 공개 API 클라우드 주소를 기준으로 PR1의 신뢰 호스트 검사를 거친 뒤 한 번만 따라간다.
다른 호스트·http·다시 리다이렉트하는 응답에는 인증을 보내지 않는다.
삭제 성공 뒤 첨부·업무 상세 메모리를 지워 오래된 참조를 쓰지 않게 한다.

### 2. 전송 경계와 오류를 검사한다

`src/api/post/web-file.test.ts`에서 직접 200의 바이트·업로드 배열·삭제 결과를 검사한다.
허용한 307, 외부 호스트 307, http 307, 두 번째 리다이렉트, 401·403·404·타임아웃을 검사한다.
외부 요청이 발생하지 않았는지와 오류·로그에 비밀값이 없는지를 함께 확인한다.
목록에서 다른 업무의 파일을 요청하는 사례와 비정상 Content-Disposition의 이름 처리를 검사한다.

## 검증

```bash
# cwd: 저장소 루트
pnpm exec vitest run src/api/post/web-file.test.ts
pnpm tsc --noEmit
node scripts/check-pii.mjs
```

테스트가 실제 파일 서버를 부르지 않고 전송·인증 경계를 증명해야 한다.

## 변경 파일

| 파일 | 변경 |
| --- | --- |
| `src/api/post/web.ts` | 수정 (파일 메서드와 첨부 캐시 무효화) |
| `src/api/post/web-file.test.ts` | 신규 (바이트·리다이렉트·파일 소속 검사) |
