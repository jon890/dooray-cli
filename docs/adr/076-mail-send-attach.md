## ADR-076: 메일 첨부는 발송 전에 전부 확인하고 크기 상한은 두지 않는다

- **status**: `accepted`

- **결정**: `mail send` 와 `mail reply` 는 `--attach <paths...>` 로 파일을 붙인다.

  경로마다 존재하는 일반 파일인지 설정 조회 뒤, 발송 전에 모두 확인한다.
  하나라도 없거나 디렉터리면 아무것도 보내지 않고 `EXIT_PARAM_ERROR`(3)로 끝난다.
  `mail reply` 는 원본 조회 전에 확인한다.

  첨부 이름은 경로의 basename 이고, 인코딩은 nodemailer 기본을 따른다.
  `mail reply` 의 확인 화면([ADR-060](060-mail-reply-confirmation-policy.md))에 첨부 이름과 크기를 함께 보이고, `--yes` 이면 같은 내용을 stderr 로 알린다.
  `--json` 출력의 `attachments` 는 보낸 파일 이름 목록이다.

  CLI 는 크기 상한을 두지 않는다.

- **맥락**: 발송은 되돌릴 수 없다. 첨부 3개 중 1개가 빠진 메일이 나가면 받는 쪽에서 바로잡을 수 없다.
  그래서 일부만 붙이는 경로를 만들지 않고 전부 확인한 뒤에만 보낸다.

  Dooray 메일의 첨부 한도는 공식 API 문서에 SMTP 경로로 적혀 있지 않았고 도움말에서도 확인하지 못했다.
  확인하지 못한 값을 코드에 박으면 한도가 바뀔 때 CLI 가 정상 발송을 막는다.
  한도를 넘으면 SMTP 서버가 거부하고 `mailErrors` 가 그 오류를 알린다.
