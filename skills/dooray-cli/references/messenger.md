# messenger

## 대화방 찾기

`logs` 나 `channel-send --channel` 에 넘길 channelId 는 `channels` 로 찾는다.
이름으로도 넘길 수 있지만 이름 해석은 제목이 있는 방만 찾는다. 1:1 방은 제목이 비어 있어 id 로만 넘길 수 있다.

```bash
dooray messenger channels --search "홍길동"               # 그 사람과의 1:1 방, 그 사람이 낀 제목 없는 그룹방
dooray messenger channels --since 2026-09-20              # 그 날 이후 수정 시각(updatedAt)이 찍힌 방
dooray messenger channels --type private --search "배포"  # 제목에 "배포" 가 든 그룹방
CH=$(dooray messenger channels --search "홍길동" --type direct --quiet)
[ -n "$CH" ] && dooray messenger logs "$CH"   # 0건이면 아무것도 나오지 않는다
```

목록은 수정 시각(`updatedAt`) 최신순이다. 보관된 방, 숨긴 방, `status` 가 `normal` 이 아닌 방은 기본으로 빠지고 `--all` 로 포함한다.
**빈 결과를 방이 없다는 뜻으로 읽지 않는다.** 빠진 방이 있으면 stderr 에 `ℹ  숨긴 방 N개를 뺐다. --all 로 모두 본다.` 가 나온다. 그러면 `--all` 을 붙여 다시 찾는다.
`--type` 은 `direct`(1:1), `private`(그룹), `me`(나와의 대화), `bot`(봇이 만든 방) 을 받는다.
제목이 빈 방은 나를 뺀 참여자 이름으로 `DM: 홍길동`, `그룹: 가, 나, 다 외 N명`, `봇: 가 외 N명` 처럼 표시하고,
제목 없는 나와의 대화방은 `나와의 대화` 로 표시한다.
`--search` 는 이 표시 문구가 아니라 제목, 제목이 없으면 나를 뺀 참여자 전원의 이름에서 찾는다.
`DM:`·`외 N명` 같은 문구로는 걸리지 않으니 1:1 방만 보려면 `--type direct` 를 쓴다.
이름 조회에 실패한 참여자가 있으면 몇 명인지 stderr 로 알린다. 그 사람의 방이 없다는 뜻이 아니다.
**`--json` 은 서버 응답 원형이라 표시명이 없다.** 제목 없는 방은 `title` 이 빈 문자열이고 참여자는 id 로만 들어 있다.
`--quiet` 으로 id 를 받아 다른 명령에 넘길 때는 결과가 정확히 한 줄인지 먼저 확인한다.
0건이면 아무것도 내지 않고 종료 코드 0 으로 끝난다. 빈 값을 `logs` 에 넘기면 엉뚱한 방을 읽을 수 있으니 위 예시처럼 막는다.
여러 줄이 나와도 그대로 넘기지 않는다.
제목 없는 방의 이름을 만들려면 참여자마다 멤버 조회가 붙어, 1:1 방이 많으면 표 출력에 수십 초가 걸린다.
`--json`·`--quiet` 에 `--search` 를 주지 않으면 이 조회를 하지 않아 바로 끝난다.

## 메시지 읽기

`logs` 가 가져올 수 있는 것은 최근 1000건까지다. 그 이전으로 거슬러 갈 수단이 API 에 없어
`-n` 에 1000 을 넘기면 조용히 잘리지 않고 에러로 끝난다. 날짜 필터도 없다.
표에는 발신자 이름이 나오지만 `--json` 은 서버 응답 원형이라 발신자가 id 로만 들어 있다.
정렬도 원형을 따라 최신이 앞이다. 표와 `--quiet` 은 대화 순서대로 뒤집어 내보내므로 둘을 나란히 대조하지 않는다.
**표의 내용 열은 60자에서 자른다.** 메시지를 읽어 요약하거나 옮겨 적을 때는 표가 아니라 `--json` 으로 전문을 받는다.
가져온 것보다 오래된 메시지가 남아 있으면 stderr 로 한 줄 알린다. stdout 에는 섞이지 않으므로 파싱에 영향이 없다.
**이 명령이 부르는 endpoint 는 공식 API 문서에 없다.** 보내는 쪽은 문서에 있고 읽는 쪽만 없다.
동작은 실제 호출로 확인했지만 호환을 약속받은 것이 아니므로 예고 없이 막힐 수 있다.
멈추면 곤란한 자동화라면 실패했을 때의 경로를 함께 둔다.

## 파일과 스레드

표의 마지막 참조 열에 다음 명령에 넣을 id 가 잘리지 않고 나온다.
파일이 붙은 메시지는 `파일 <fileId>`, 스레드가 달린 메시지는 `스레드(<댓글 수>) <channelId>` 이고 둘 다면 한 칸에 두 줄이다.
파일 메시지의 내용 열은 `[파일] <파일명> (<크기>)` 로 시작한다.

```bash
dooray messenger logs "<스레드 channelId>"                        # 스레드 안의 댓글 읽기
dooray messenger file download "배포알림" <fileId> -o ./files    # 원본 파일명으로 저장
```

`--json` 에서는 `file.id` 와 `thread.channelId` 로 같은 값을 얻는다. 파일 판정은 `type` 이 아니라 `file` 필드 유무로 한다. `REPLY` 에도 파일이 붙는다.
**`file download` 에는 그 파일이 올라온 대화방을 준다.** 스레드의 파일은 스레드 channelId 와 그 스레드가 달린 대화방 channelId 어느 쪽으로도 받아진다.
조합이 틀린 경우와 파일이 없는 경우는 같은 "파일을 찾지 못했다" 에러라 구분되지 않는다.
**이 명령이 부르는 endpoint 도 공식 API 문서에 없다.** 예고 없이 막힐 수 있다.

## 스레드에 보고 쌓기

진행 상황을 여러 번 보고할 때는 대화방 본문에 늘어놓지 말고 스레드에 쌓는다.
`thread-send --quiet` 이 내는 값은 log-id 가 아니라 새로 만들어진 스레드 채널의 id 이고,
그 값을 `channel-send --channel` 에 주면 메시지가 스레드에 붙는다.

```bash
THREAD=$(dooray messenger thread-send --channel "배포알림" --body "v1.2.3 배포" --quiet)
dooray messenger channel-send --channel "$THREAD" --body "빌드 통과"
dooray messenger channel-send --channel "$THREAD" --body "배포 완료"
```
