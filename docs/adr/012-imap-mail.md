## ADR-012: IMAP 메일 연동

**결정**: Dooray IMAP 서버(imap.dooray.com)를 통해 메일 조회 기능 추가

**이유**:

- Dooray는 공식 메일 API를 제공하지 않으나 IMAP/SMTP를 지원
- 주간 업무 알림, 일정 알림 등 메일을 CLI에서 확인하여 생산성 향상
- `imapflow` (IMAP)와 `mailparser` (파싱) 조합으로 구현

**서버 특성**:

- `SEARCH SINCE`·`BEFORE` 는 일자 단위로만 동작한다. 시각으로 좁힐 수 없어 앞뒤 하루를 더해 후보를 좁힌다 ([ADR-040](040-mail-url-to-uid-lookup.md))
- `SORT` 미지원 → UID 역순(최신순)으로 대체
- `SUBJECT`, `FROM`, `TO`, `UNSEEN`, `SEEN` 검색은 지원

**기본값 전략**: imap-host, imap-port, smtp-host, smtp-port는 기본값 제공 (Dooray 사용자 대다수 동일).
사용자는 imap-username, imap-password만 설정하면 됨.

**트레이드오프**: imapflow와 mailparser 의존성 추가 → tsup에서 external 처리 필요 (번들 미포함, node_modules에서 로드)
