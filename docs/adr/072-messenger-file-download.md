## ADR-072: 메신저 첨부 파일을 `messenger file download` 로 받고 `logs` 표에 파일 id 와 스레드 channelId 를 보여준다

**결정**: `GET /messenger/v1/channels/{channelId}/files/{fileId}` 를 `dooray messenger file download <channel> <fileId>` 로 감싼다.
저장 옵션은 업무 첨부 다운로드와 같은 `-o, --output <dir>` 과 `--output-file <path>` 다.
`messenger logs` 표에는 마지막 칸 `참조` 를 더해 파일 id 와 스레드 channelId 를 자르지 않고 보여준다.

**맥락**: ADR-061 의 `messenger logs` 는 메시지 본문만 표에 담았다.
파일 메시지는 `text` 가 파일명과 같아서 일반 메시지와 구분되지 않았고, 파일을 받을 명령도 없었다.
스레드가 달린 메시지도 표에서는 그 사실이 보이지 않아, 스레드 안의 대화를 읽으려면 `--json` 을 열어 id 를 찾아야 했다.

**실측으로 확인한 것** (2026-10-21):

`GET /messenger/v1/channels/{channelId}/logs` 의 로그 항목에는 ADR-061 이 적은 필드 외에 다음이 온다.

- **`file`** — `{ id, title, fileName, fileSize, mimeType, ... }`. `fileSize` 는 숫자다.
  `type` 이 `FILE` 인 메시지에 붙고, `REPLY` 에도 붙는 경우가 있다. 그래서 파일 판정은 `type` 이 아니라 `file` 필드 유무로 한다.
  `FILE` 메시지의 `text` 는 파일명과 같다.
- **`thread`** — `{ channelId, totalCount, lastUpdatedAt }`. 스레드가 달린 메시지에만 온다.
  `totalCount` 는 숫자가 아니라 문자열 숫자다. 이 `channelId` 를 `messenger logs` 에 넣으면 스레드 댓글이 그대로 조회된다.
  `resolveMessengerChannel` 은 15자리 이상 숫자를 그대로 통과시키므로 별도 처리가 필요 없다.
- `attachments` `originalLog` `reactions` `customName` 도 오지만 이번 범위에서 다루지 않는다.

파일 다운로드 경로의 동작:

- **api 서버는 항상 307 을 준다.** `location` 은 api 서버와 다른 `file-api` 호스트의 `/downloads/messenger/v1/channels/{channelId}/files/{fileId}` 이고 쿼리가 없다.
  업무 첨부와 달리 `media=raw` 를 붙여도 붙이지 않아도 똑같이 307 이라 보내지 않는다.
- **`location` 은 `Authorization` 헤더를 붙여야 받는다.** 붙이면 200 이고 `content-type` 은 원본 `mimeType`,
  바이트 수는 `fileSize` 와 같다. 헤더가 없으면 401 이다.
- **`content-disposition` 은 `attachment;fileName="<이름>";` 이다.** 키가 `fileName` 으로 대소문자가 섞여 있다.
  ADR-067 의 파서는 대소문자를 가리지 않으므로 그대로 쓴다.
- **api 서버는 채널과 파일 조합을 검증하지 않는다.** 다른 대화방의 파일 id, 없는 파일 id, 없는 채널 id 모두 307 을 받고,
  file-api 쪽에서 **본문 없는 404** 가 된다. 세 경우를 응답으로 구분할 수 없다.
- **스레드에 올라온 파일은 스레드 channelId 로도, 그 스레드가 달린 대화방 channelId 로도 받아진다.**
  두 경우 모두 같은 바이트 수의 같은 파일이 왔다. 다른 대화방의 파일 id 는 404 이므로, 스레드는 부모 대화방의 일부로 판정되는 것으로 보인다.
- 대화방 멤버가 아닌 채널의 파일을 받으면 어떻게 되는지는 **확인하지 못했다.**

**공식 문서에 없는 endpoint 다**:

2026-10-21 에 공식 문서를 headless Chrome 으로 렌더해 Messenger 절을 확인했다.
`CLAUDE.md` 가 정한 `browser-driver` 가 이 장비에 없어 같은 일을 하는 headless Chrome 으로 대신했다.
그 절에 실린 endpoint 는 11개이고 `GET /messenger/v1/channels/{channelId}/files/{fileId}` 는 없다.
렌더한 전체 endpoint 145개는 `docs/api/official-endpoints.txt` 스냅샷과 같았다. 스냅샷이 낡아서 빠진 것이 아니다.

ADR-062 의 조건 넷을 이렇게 채웠다.

1. 공식 문서 확인 — 위 날짜와 절.
2. 동작 실측 — 위 「실측으로 확인한 것」.
3. `scripts/api-endpoint-inventory.mjs` 의 `KNOWN_UNDOCUMENTED` 에 `GET messenger/v1/channels/{id}/files/{id}` 를 등록했다.
4. `README.md` 와 `docs/guide/messenger.md` 와 `skills/dooray-cli/SKILL.md` 와 `skills/dooray-cli/references/messenger.md`,
   그리고 `file download` 의 `--help` 설명에 예고 없이 막힐 수 있다는 것을 적었다.

조회 전용이라 ADR-062 의 읽기 전용 조건도 맞는다.

**설계 결정**:

- **`logs` 표의 `참조` 칸에 id 를 그대로 둔다.** 파일 id 와 스레드 channelId 는 다음 명령(`file download`, `logs`)에 넣을 값이다.
  `--json` 을 열어 찾지 않고 표에서 바로 복사할 수 있어야 한다. 그래서 `내용` 칸과 달리 60자로 자르지 않는다.
  파일과 스레드가 둘 다 있으면 한 칸 안에서 줄을 나눈다. 서버 값은 항목마다 `sanitizeForTerminal` 을 거친 뒤 잇는다.
  한꺼번에 거치면 구분용 줄바꿈까지 `?` 로 바뀐다.
- **`내용` 칸은 `[파일] <fileName> (<크기>)` 로 시작한다.** `text` 가 비어 있지 않고 파일명과 다르면 그 뒤에 잇는다.
  `REPLY` 에 파일이 붙은 경우 본문이 사라지지 않게 하려는 것이다. 크기는 업무 첨부 목록과 같은 `formatSize` 로 쓴다.
- **`--json` 과 `--quiet` 은 바꾸지 않는다.** `--json` 은 이미 `file` 과 `thread` 를 원형으로 담고 있다 (ADR-061 의 원형 유지).
- **404 는 CLI 가 메시지를 만든다.** file-api 의 404 는 본문이 없어 `파일 다운로드 실패 (404)` 만으로는 무엇을 고칠지 알 수 없다.
  세 원인을 응답으로 가를 수 없으므로 대화방 id 와 파일 id 조합을 확인하라고 알린다. 종료 코드는 다른 API 4xx 와 같은 `EXIT_API_ERROR` 다.
- **api 서버가 307 이 아닌 status 를 주면 file-api 를 부르지 않고 실패한다.** 위키 첨부(ADR-015)와 같은 처리다.
- **파일명은 ADR-067 규칙을 따르되 목록 이름 단계가 없다.** 메신저에는 파일 하나의 이름을 따로 물을 경로가 없어서
  헤더로 못 풀면 바로 `<fileId>.<ext>`, 확장자도 없으면 `<fileId>` 로 저장한다.
- **업무·위키 다운로드와 같은 helper(`followDownloadRedirect`)를 거친다 (ADR-074).** 처음에는 두 경로의 세부가 달라 따로 두었으나,
  ADR-074 가 둘을 helper 로 묶은 뒤 이 명령도 맞췄다. 위치 URL 의 도메인 확인, 첫 응답 30초 제한, 파일 서버의 연쇄 redirect 차단을 함께 받는다.
  404 안내 문구만 이 명령이 helper 에 넘긴다.

**대안 기각**:

- **`messenger download` 평면 명령** — 업무·위키 첨부는 `post file download`, `wiki page file download` 처럼 `file` 그룹 아래에 있다.
  메신저만 평면으로 두면 같은 일의 명령 구조가 영역마다 달라진다. 목록·업로드가 생길 때 자리도 마땅치 않다.
- **log id 로 받기** — log id 에서 파일 id 를 얻으려면 로그 조회 호출이 하나 더 붙는다.
  그 조회도 최근 1000건까지라(ADR-061) 오래된 메시지의 파일은 찾지 못한다.
- **`logs --with-threads` 로 스레드 댓글 펼치기** — 스레드 수만큼 호출이 늘어난다. 참조 칸의 channelId 를 다시 `logs` 에 넣으면 되므로 이번에는 미룬다.
