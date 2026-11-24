# 메신저

작업 결과를 메신저로 바로 보내고, 대화방의 메시지를 읽는 방법을 안내해요.
아직 연결하지 않았다면 [설치와 설정](setup.md)을 먼저 따라 해요.

1. [메시지 보내기](#메시지-보내기)
2. [스레드에 이어서 보내기](#스레드에-이어서-보내기)
3. [대화방 찾기](#대화방-찾기)
4. [메시지 읽기](#메시지-읽기)
5. [파일 받기](#파일-받기)
6. [알아 둘 점](#알아-둘-점)
7. [웹 방식](#웹-방식)
8. [자세히](#자세히)

## 메시지 보내기

```bash
dooray messenger send --to user@example.com --body "배포 완료됐습니다"   # 1:1 메시지
dooray messenger channel-send --channel "배포알림" --body "v1.2.3 배포"  # 대화방 메시지
```

- `send` 의 `--to` 는 멤버 ID 나 이메일을 받아요. 이름은 받지 않아요.
- `channel-send` 의 `--channel` 은 channelId 나 대화방 이름을 받아요. 이름으로는 내가 속한 방만 찾아요.
- `--body` 대신 `--body-file` 로 파일을 줄 수 있어요.
- 둘 다 생략하면 `$EDITOR` 가 열려서 직접 쓸 수 있어요.

## 스레드에 이어서 보내기

진행 상황을 여러 번 보고할 때는 스레드를 열어서 그 안에 쌓아요.

1. `thread-send` 로 스레드를 열어요. `--quiet` 을 붙이면 새 스레드 채널의 id 가 나와요.
2. 그 id 를 `channel-send` 의 `--channel` 에 주면 메시지가 스레드에 붙어요.

```bash
THREAD=$(dooray messenger thread-send --channel "배포알림" --body "v1.2.3 배포" --quiet)
dooray messenger channel-send --channel "$THREAD" --body "테스트 통과"
```

- `--thread-body` 로 스레드의 첫 메시지를 함께 보낼 수 있어요. 파일로 주려면 `--thread-body-file <path>` 를 써요.
- 둘 다 생략하면 스레드만 열려요.

이미 올라간 메시지에 스레드를 열려면 그 메시지의 log-id 를 `--log` 로 줘요.

```bash
dooray messenger thread-send --channel "배포알림" --log <logId> --body "빌드 로그"
```

## 대화방 찾기

내가 속한 대화방은 `channels` 로 봐요.
`logs` 나 `channel-send` 에 넘길 channelId 를 여기서 찾아요.

```bash
dooray messenger channels                         # 전체 (수정 시각 최신순)
dooray messenger channels --search "홍길동"       # 이름 부분 일치 (대소문자 무시)
dooray messenger channels --since 2026-09-20      # 그 날 이후 수정 시각(updatedAt)이 찍힌 방
dooray messenger channels --type direct --quiet   # 1:1 방 id 만
```

수정 시각(`updatedAt`)이 최신인 방이 위에 와요.

| 옵션 | 뜻 |
| --- | --- |
| `--search` | 이름에 이 글자가 들어간 방. 빈 검색어는 거부해요 |
| `--since` | 이 시각 이후에 수정된 방. `YYYY-MM-DD` 나 offset 이 붙은 시각을 받아요 |
| `--type` | 방 종류. 아래 표를 봐요 |
| `--all` | 숨긴 방과 보관된 방까지 함께 보여 줘요 |

`--type` 에는 이런 값을 줄 수 있어요.

| 값 | 방 종류 |
| --- | --- |
| `direct` | 1:1 |
| `private` | 그룹 |
| `me` | 나와의 대화 |
| `bot` | 봇이 만든 방 |

- 보관된 방, 숨긴 방, 상태(`status`)가 `normal` 이 아닌 방(`system`, `archived`, `deleted`)은 기본으로 빠져요. `--all` 을 주면 함께 나와요.
- 빠진 방이 있으면 stderr 로 이유별 수와 `--all` 안내를 한 줄 알려 줘요.
- 결과가 0건인데 이 안내가 있으면, 찾는 방이 숨긴 방이나 보관된 방일 수 있어요.
- `--json` 과 `--quiet` 출력은 이 안내 때문에 바뀌지 않아요.

제목이 없는 방의 표시 규칙과 속도는 [자세히](#제목-없는-방의-표시와-속도)에 있어요.

## 메시지 읽기

대화방의 메시지는 `logs` 로 읽어요.
대화방 인자는 `channel-send` 와 같게 channelId 나 이름을 받아요.

```bash
dooray messenger logs "배포알림"              # 최근 20건
dooray messenger logs "배포알림" --count 200  # 최근 200건 (-n 200 과 같다)
dooray messenger logs "배포알림" --json       # 서버 응답 원형
```

표는 오래된 메시지가 위, 최신이 아래로 나와요. 발신자는 이름으로 보여 줘요.
이름 조회에 실패한 발신자는 id 로 남아요.

표를 읽을 때 알아 둘 점이 있어요.

- 내용 열은 60자에서 자르고 잘린 자리에 `…` 를 붙여요. 메시지 전문은 `--json` 으로 봐야 해요. 긴 메시지를 옮겨 적거나 요약할 때 표만 보면 뒷부분을 놓쳐요.
- 파일 메시지는 내용 열에 `[파일] 보고서.pdf (2.0KB)` 처럼 파일명과 크기가 나와요.
- 표 마지막의 참조 열에는 다음 명령에 넣을 id 가 잘리지 않고 나와요. 파일이 있으면 `파일 <fileId>`, 스레드가 달린 메시지면 `스레드(<댓글 수>) <channelId>` 예요.
- `--json` 은 서버 응답 그대로라서 이름이 들어가지 않아요. 정렬도 서버가 주는 대로 최신이 앞이에요. 표와 `--quiet` 은 대화 순서대로 뒤집어요.

### 스레드 답글 읽기

스레드 안의 대화는 그 channelId 를 `logs` 에 다시 넣어서 읽어요.
스레드 답글을 읽는 명령이 따로 있지 않아요.
표에 스레드가 있으면 stderr 로 이 명령을 한 줄로 알려 줘요.

```bash
dooray messenger logs <스레드 channelId>
```

## 메시지에 리액션 달고 떼기

```bash
dooray messenger react "<channel>" <messageId> --emoji +1
dooray messenger react "<channel>" <messageId> --emoji +1 --remove
```

대화방 이름이나 ID를 쓰고, 메시지 ID는 `messenger logs` 에서 찾아요.
`messenger react --help` 에서 지원하는 이모지 이름을 볼 수 있어요. `thumbsup` 같은 별칭이나 이모지 문자를 입력하면 종료 코드 3으로 끝나요.

이 명령은 저장한 웹 세션을 사용해요. API 키 방식에서도 테넌트 이름을 설정하고 `dooray config set session-cookie -` 로 쿠키를 저장하면 쓸 수 있어요.
세션이 없거나 만료되면 종료 코드 3을 반환해요. 공식 API 문서에 없는 경로라 예고 없이 막힐 수 있어요.

`--json` 은 `channelId`, `messageId`, `emoji`, `status`(`added` 또는 `removed`)를 출력해요. `--quiet` 은 메시지 ID만 출력해요.

## 파일 받기

파일 메시지의 `fileId` 는 `logs` 출력 마지막의 참조 열에서 찾아요.

```bash
dooray messenger file download "배포알림" <fileId> -o ./files
dooray messenger file download "배포알림" <fileId> --output-file ./보고서.pdf
```

- `-o` 는 저장할 폴더(기본은 현재 폴더)예요. 원본 파일명으로 저장해요.
- `--output-file` 은 저장 경로를 직접 정해요.
- 대화방 인자는 그 파일이 올라온 대화방이에요. 스레드에 올라온 파일은 스레드의 channelId 와 그 스레드가 달린 대화방 중 어느 쪽을 줘도 받아져요.
- 대화방과 파일 id 가 맞지 않으면 파일을 찾지 못했다는 에러로 끝나요. 없는 파일 id 를 줘도 같은 에러예요.

## 알아 둘 점

**가져올 수 있는 메시지는 최근 1000건까지예요.**
그 이전으로 거슬러 갈 방법이 API 에 없어요. 날짜로 필터링하는 옵션도 없어요.

- `-n` 에 1000 을 넘기면 조용히 잘리는 대신 에러로 끝나요.
- 가져온 것보다 오래된 메시지가 남아 있으면 그 사실만 stderr 로 알려 줘요. stdout 에는 데이터만 담아요.

**`logs` 와 `file download` 는 Dooray 공식 API 문서에 없는 경로를 써요.**
같은 경로로 메시지를 보내는 쪽은 문서에 있지만 읽는 쪽과 파일을 받는 쪽은 없어요.
실제 호출로 동작을 확인했지만 호환을 약속받은 것은 아니에요.
예고 없이 막히거나 응답이 바뀔 수 있으니, 멈추면 곤란한 자동화에 넣을 때는 이 점을 감안해요.

## 웹 방식

`auth-mode` 가 `web` 이면 메신저 명령도 웹 화면이 쓰는 경로로 돌아요.
`--json` 은 공식 API 의 필드 이름과 구조를 그대로 써요.
지원 표와 빠질 수 있는 필드는 [설치와 설정](setup.md)의 「웹 방식의 지원 범위」 에서 확인해요.

## 자세히

### 제목 없는 방의 표시와 속도

1:1 방과 일부 그룹방은 제목이 비어 있어요.
표에는 나를 뺀 참여자 이름으로 보여 줘요.

| 방 | 표시 |
| --- | --- |
| 1:1 | `DM: 홍길동` |
| 그룹 | `그룹: 가, 나, 다 외 N명` |
| 봇 | `봇: 가, 나 외 N명` |
| 제목 없는 나와의 대화방 | `나와의 대화` |

- `--search` 는 제목에서 찾아요. 제목이 없으면 나를 뺀 참여자 모두의 이름에서 찾아요.
- 이름을 확인하지 못한 참여자가 있으면 그 수를 stderr 로 알려 줘요.
- `--json` 은 필터링과 정렬만 한 서버 응답 그대로예요. 만든 이름이 들어가지 않아요.
- 참여자 이름을 얻으려면 멤버를 하나씩 조회해야 해요. 1:1 방이 많으면 표 출력이 수십 초 걸려요.
- `--json` 이나 `--quiet` 에 `--search` 를 주지 않으면 이 조회를 건너뛰어요.
