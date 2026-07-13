## ADR-013: SMTP 메일 발송

**결정**: nodemailer를 사용하여 Dooray SMTP(smtp.dooray.com:465)로 메일 발송

**이유**:

- 메일 조회(IMAP)만으로는 반쪽짜리 기능 → 발송까지 지원해야 CLI에서 메일 워크플로우 완결
- nodemailer는 Node.js 메일 발송 de facto 표준 (성숙, 안정)
- SMTP 인증은 IMAP과 동일한 자격증명 사용 → 추가 설정 불필요

**지원 기능**: send (to/cc/bcc/subject/body/html), reply (In-Reply-To로 스레드 유지)

**추후 고민**: 첨부파일(`--attach`) 지원
