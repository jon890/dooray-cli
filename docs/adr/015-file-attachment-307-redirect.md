## ADR-015: 파일 첨부 API 307 리다이렉트 수동 처리

**결정**: Dooray 파일 업로드/다운로드 시 307 리다이렉트를 수동 처리

**이유**:

- Dooray 파일 API는 307 Temporary Redirect로 실제 파일 서버 URL을 반환
- 브라우저/HTTP 클라이언트의 자동 리다이렉트는 Authorization 헤더와 요청 body를 strip → 인증 실패
- `redirect: "manual"`로 첫 응답의 Location 헤더를 캡처한 후, 해당 URL로 Auth 헤더를 포함한 2차 요청 필요

**구현**:

- 다운로드: `?media=raw` 쿼리 파라미터로 307 유도 후 Location 헤더 캡처, fetch로 2차 요청
- 업로드: `fetch` 직접 사용 (`ky`는 307, `redirect: "manual"` 조합에서 정상 동작하지 않음)
- 2차 요청 시 동일한 Authorization 헤더 첨부
- 업로드: FormData, Blob, 다운로드: ArrayBuffer로 수신 후 파일 저장
