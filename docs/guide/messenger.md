# 메신저

작업 결과를 메신저로 바로 보낸다.

```bash
dooray messenger send --to user@example.com --body "배포 완료됐습니다"   # 1:1 메시지
dooray messenger channel-send --channel "배포알림" --body "v1.2.3 배포"  # 대화방 메시지
```

`send` 의 `--to` 는 멤버 ID 나 이메일을 받고 이름은 받지 않는다.
`channel-send` 의 `--channel` 은 channelId 나 대화방 이름을 받고, 이름으로는 자신이 속한 방만 찾는다.
`--body` 대신 `--body-file` 로 파일을 주거나 둘 다 생략해 `$EDITOR` 에서 쓸 수 있다.

진행 상황을 여러 번 보고할 때는 스레드를 열어 그 안에 쌓는다.
`thread-send` 에 `--quiet` 을 붙이면 새로 만들어진 스레드 채널의 id 가 나오고,
그 값을 `channel-send` 의 `--channel` 에 주면 메시지가 스레드에 붙는다.

```bash
THREAD=$(dooray messenger thread-send --channel "배포알림" --body "v1.2.3 배포" --quiet)
dooray messenger channel-send --channel "$THREAD" --body "테스트 통과"
```

`--thread-body` 로 스레드 첫 메시지를 함께 보낼 수 있고, 파일로 주려면 `--thread-body-file <path>` 를 쓴다.
둘 다 생략하면 스레드만 열린다.

이미 올라간 메시지에 스레드를 열려면 그 메시지의 log-id 를 `--log` 로 준다.

```bash
dooray messenger thread-send --channel "배포알림" --log <logId> --body "빌드 로그"
```

내가 속한 대화방은 `channels` 로 본다. 수정 시각(`updatedAt`)이 최신인 방이 위에 오고,
`logs` 나 `channel-send` 에 넘길 channelId 를 여기서 찾는다.

```bash
dooray messenger channels                         # 전체 (수정 시각 최신순)
dooray messenger channels --search "홍길동"       # 이름 부분 일치 (대소문자 무시)
dooray messenger channels --since 2026-09-20      # 그 날 이후 수정 시각(updatedAt)이 찍힌 방
dooray messenger channels --type direct --quiet   # 1:1 방 id 만
```

1:1 방과 일부 그룹방은 제목이 비어 있다. 표에는 나를 뺀 참여자 이름으로 `DM: 홍길동`,
`그룹: 가, 나, 다 외 N명`, `봇: 가, 나 외 N명` 처럼 보여주고, 제목 없는 나와의 대화방은 `나와의 대화` 로 보여준다. `--search` 는 제목에서 찾고, 제목이 없으면
나를 뺀 참여자 모두의 이름에서 찾는다. 이름을 확인하지 못한 참여자가 있으면 그 수를 stderr 로 알린다.
`--type` 은 `direct`(1:1), `private`(그룹), `me`(나와의 대화), `bot`(봇이 만든 방) 을 받는다. 빈 검색어는 거부한다. `--since` 는 `YYYY-MM-DD` 나 offset 이 붙은 시각을 받는다.
보관된 방, 숨긴 방, 시스템 방은 기본으로 빠지고 `--all` 을 주면 함께 나온다.
`--json` 은 거르고 정렬만 한 서버 응답 그대로라 만든 이름이 들어가지 않는다.
참여자 이름을 얻으려면 멤버를 하나씩 조회해야 해서 1:1 방이 많으면 표 출력이 수십 초 걸린다.
`--json` 이나 `--quiet` 에 `--search` 를 주지 않으면 이 조회를 건너뛴다.

대화방에 올라온 메시지는 `logs` 로 읽는다. 대화방 인자는 `channel-send` 와 같게 channelId 나 이름을 받는다.

```bash
dooray messenger logs "배포알림"              # 최근 20건
dooray messenger logs "배포알림" --count 200  # 최근 200건 (-n 200 과 같다)
dooray messenger logs "배포알림" --json       # 서버 응답 원형
```

표는 오래된 메시지가 위, 최신이 아래로 나오고 발신자는 이름으로 보여준다.
이름 조회에 실패한 발신자는 id 로 남는다. `--json` 은 서버 응답 그대로라 이름이 들어가지 않고,
정렬도 서버가 주는 대로 최신이 앞이다. 표와 `--quiet` 은 대화 순서대로 뒤집는다.

표의 내용 열은 60자에서 자르고 잘린 자리에 `…` 를 붙인다. 메시지 전문은 `--json` 으로 봐야 한다.
긴 메시지를 옮겨 적거나 요약할 때 표만 보면 뒷부분을 놓친다.

가져올 수 있는 범위는 최근 1000건까지다. 그 이전으로 거슬러 갈 수단이 API 에 없어
`-n` 에 1000 을 넘기면 조용히 잘리는 대신 에러로 끝난다. 날짜로 거르는 옵션도 없다.
가져온 것보다 오래된 메시지가 남아 있으면 그 사실만 stderr 로 알린다. stdout 은 데이터만 담는다.

**이 명령이 부르는 endpoint 는 Dooray 공식 API 문서에 실려 있지 않다.**
같은 경로로 메시지를 보내는 쪽은 문서에 있는데 읽는 쪽만 없다.
동작은 실제 호출로 확인했지만 호환을 약속받은 것이 아니라서, 예고 없이 막히거나 응답이 바뀔 수 있다.
멈추면 곤란한 자동화에 넣을 때는 이 점을 감안한다.
