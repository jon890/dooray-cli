# dooray-cli

[![npm version](https://img.shields.io/npm/v/@bifos/dooray-cli.svg)](https://www.npmjs.com/package/@bifos/dooray-cli)
[![npm downloads](https://img.shields.io/npm/dm/@bifos/dooray-cli.svg)](https://www.npmjs.com/package/@bifos/dooray-cli)
[![CI](https://github.com/jon890/dooray-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/jon890/dooray-cli/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/@bifos/dooray-cli.svg)](https://github.com/jon890/dooray-cli/blob/main/LICENSE)

[NHN Dooray](https://dooray.com) 를 터미널과 AI 에이전트에서 쓸 수 있게 해 주는 CLI 예요.

업무, 댓글, 위키, 메일, 메신저, 캘린더를 명령 한 줄로 다뤄요.
Claude Code 에 스킬로 설치하면 "업무 만들어줘" 같은 말을 그대로 알아듣고 처리해요.

```
"백엔드 프로젝트에 '로그인 실패 로그 확인' 업무 만들고 김철수 담당자로 지정해줘"
"42번 업무에 '80% 완료' 댓글 달아줘"
"안 읽은 메일 보여줘"
"개발팀 대화방에 배포 완료 알려줘"
```

## 이런 분께 맞아요

- Dooray 웹을 열지 않고 터미널에서 업무를 확인하고 정리하고 싶은 분
- AI 에이전트에게 업무 등록, 댓글, 위키 정리를 맡기고 싶은 분
- 배포 알림이나 정기 보고처럼 반복되는 Dooray 작업을 스크립트로 자동화하고 싶은 분

## 빠른 시작

Node.js 20 이상이 필요해요.

### 1. 설치해요

```bash
npm install -g @bifos/dooray-cli
```

### 2. Dooray 계정을 연결해요

먼저 Dooray 웹의 **설정 → API → 인증 토큰** 에서 토큰을 만들어요.
그다음 아래 명령을 실행하면 필요한 값을 차례로 물어봐요.

```bash
dooray setup
```

연결이 잘 됐는지는 `doctor` 로 확인해요.

```bash
dooray doctor
```

### 3. 첫 명령을 실행해요

```bash
dooray project list          # 내 프로젝트 목록
dooray post list <project>   # 그 프로젝트의 업무 목록
```

`<project>` 자리에는 프로젝트 목록에 나온 프로젝트 코드를 넣어요.

### 4. AI 에이전트에 연결해요 (선택)

Claude Code 를 쓴다면 스킬을 설치해요. 에이전트가 이 CLI 의 사용법을 알게 돼요.

```bash
dooray skill install
```

이제 에이전트에게 한국어로 시키면 돼요.
에이전트가 알맞은 `dooray` 명령을 고르고, 필요하면 프로젝트 코드나 업무 번호를 먼저 찾아봐요.
업무 URL 을 그대로 붙여 넣어도 돼요.

CLI 를 새 버전으로 올린 뒤에는 `dooray skill update` 를 한 번 실행해 주세요. 그래야 스킬도 함께 갱신돼요.

## 할 수 있는 일

| 영역 | 할 수 있는 일 | 명령 | 가이드 |
| --- | --- | --- | --- |
| 업무 | 조회, 검색, 생성, 수정, 본문 일부 치환, 완료 처리, 상태 변경, 댓글, 첨부 파일 | `dooray post` | [업무와 위키](docs/guide/post-wiki.md) |
| 위키 | 페이지 조회, 생성, 수정, 본문 일부 치환, 이동, 삭제, 댓글, 첨부 파일 | `dooray wiki` | [업무와 위키](docs/guide/post-wiki.md) |
| 프로젝트 | 프로젝트, 멤버, 태그, 워크플로우, 템플릿 조회와 태그 생성 | `dooray project` | [업무와 위키](docs/guide/post-wiki.md#프로젝트-태그-만들기) |
| 메신저 | 1:1 메시지, 대화방 메시지, 스레드, 대화방 목록, 메시지 조회 | `dooray messenger` | [메신저](docs/guide/messenger.md) |
| 메일 | 목록, 상세 조회, 발송, 답장 | `dooray mail` | `dooray mail --help` |
| 캘린더 | 캘린더와 일정 조회 (읽기 전용) | `dooray calendar` | [캘린더](docs/guide/calendar.md) |
| 멤버 | 조직 멤버 검색과 상세 조회 | `dooray member` | `dooray member --help` |

## 자주 쓰는 명령

에이전트 없이 터미널에서 바로 써도 돼요.

```bash
dooray post list <project> --to me                  # 내가 담당인 업무
dooray post get <project> 42                        # 42번 업무 상세
dooray post create <project> --title "제목"         # 업무 생성
dooray post comment add <project> 42 --body "댓글"  # 댓글 달기
dooray post replace <project> 42 --old "초안" --new "확정"   # 본문 일부만 고치기
dooray post done <project> 42                       # 완료 처리
dooray wiki pages <project>                         # 위키 페이지 목록
dooray mail list --unread                           # 안 읽은 메일
dooray messenger channel-send --channel "배포알림" --body "배포 완료"
dooray calendar event list                          # 오늘 일정
```

업무나 위키 페이지를 가리킬 때는 `<project> <번호>` 대신 Dooray URL 을 그대로 줘도 돼요.

명령과 옵션 전체는 `--help` 로 볼 수 있어요.

```bash
dooray --help
dooray post --help
dooray post create --help
```

### 출력 형식을 골라요

| 옵션 | 출력 | 쓰는 곳 |
| --- | --- | --- |
| (없음) | 사람이 읽기 좋은 표 | 터미널 |
| `--json` | JSON | 다른 프로그램에서 읽을 때 |
| `--quiet` | ID 만 | 셸 스크립트 |

```bash
POST_ID=$(dooray post create <project> --title "배포" --quiet)
dooray post comment add --id "$POST_ID" --body "시작합니다"
```

## 더 알아보기

| 문서 | 내용 |
| --- | --- |
| [설치와 설정](docs/guide/setup.md) | 설정 값 바꾸기, 토큰을 안전하게 넣는 방법, 스킬 관리, 출력 모드 |
| [업무와 위키](docs/guide/post-wiki.md) | 태그와 기간으로 거르기, 본문 일부 치환, 본문 형식, 멘션, 첨부 파일, 삭제 확인 |
| [메신저](docs/guide/messenger.md) | 메시지 보내기, 스레드, 대화방 목록, 메시지 조회 |
| [캘린더](docs/guide/calendar.md) | 캘린더와 일정 조회 |
| [문체 페르소나](docs/guide/persona.md) | 내 Dooray 글을 모아 에이전트가 내 문체로 쓰게 하는 스킬 |
| [스킬 문서](skills/dooray-cli/SKILL.md) | 에이전트가 읽는 명령 목록과 판단 기준 |

## 문제가 생기면

- 설정이 의심되면 `dooray doctor` 를 먼저 실행해 보세요. 설정과 API 연결, 스킬 상태를 한 번에 확인해요.
- 에이전트가 새 명령을 모르면 `dooray skill update` 를 실행해 주세요.
- 버그나 제안은 [GitHub Issues](https://github.com/jon890/dooray-cli/issues) 에 남겨 주세요. `dooray feedback` 으로 터미널에서 바로 올릴 수도 있어요.

## 기여하기

이슈와 PR 모두 환영해요.
개발 환경을 준비하는 방법과 새 명령을 추가하는 순서는 [CONTRIBUTING.md](CONTRIBUTING.md) 에 있어요.

## 라이선스

[MIT](LICENSE)
