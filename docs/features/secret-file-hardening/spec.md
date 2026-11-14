# 비밀값·캐시 파일 보호 강화

확인: 2026-11-13

## 목표

`apiKey`·IMAP 비밀번호 같은 비밀값과 사내 정보가 든 캐시가, 같은 PC 의 다른 계정이나 설정 파일 사본에 새지 않는다.
새는 상태가 되면 사용자가 바로 알아챈다.

## 배경

macOS 는 비밀값을 로그인 키체인에 둔다([ADR-069](../../adr/069-macos-keychain-secret-store.md)). 키체인으로 옮기는 일은 CLI 가 설정을 저장할 때만 일어난다.
2026-11-13 에 개발자 PC 에서 `~/.dooray/config.json` 이 0644 로 `apiKey`·`imapPassword` 평문을 담고 있었고 키체인 항목은 없었다.
CLI 가 아닌 무언가가 파일을 쓴 뒤 CLI 저장이 한 번도 일어나지 않아, 평문이 다른 계정에도 읽히는 채로 남아 있었다. CLI 는 이를 알리지 않았다.
같은 PC 의 `~/.dooray/cache/` 는 폴더 0755, 파일 0644 로 멤버 이름·메일과 프로젝트 목록을 다른 계정에 보였다.

## 범위

- macOS 에서 `config.json` 에 비밀 필드 평문이 있거나, 비밀값을 담은 `config.json` 의 권한이 0600 보다 넓을 때 알린다.
- Windows·Linux 의 평문 저장 상태를 `doctor` 가 알린다.
- 캐시 폴더와 파일을 본인만 읽게 쓴다.
- 직전 실행 기록(`last-run.json`)을 쓸 때 `~/.dooray` 를 본인만 열게 만들고, 임시 파일 이름이 겹치지 않게 한다.
- `doctor` 가 문제를 찾으면 종료 코드로 알린다.

범위 밖:

- Windows 비밀값 암호화 저장(DPAPI 또는 자격 증명 관리자). 다음 PR 로 미룬다.
- Linux 비밀값 저장소(`secret-tool`).
- 읽기 명령이 설정 파일을 고치는 자동 수리. [ADR-069](../../adr/069-macos-keychain-secret-store.md) 의 「읽을 때 옮기기」 기각을 유지한다.
- 웹 로그인 쿠키 보관 규칙. `docs/features/web-session-auth/spec.md` 가 소유한다.

## 요구사항과 인수 조건

| ID | 요구사항 | 관측할 인수 조건 |
| --- | --- | --- |
| REQ1 | macOS 에서 `config.json` 에 키체인으로 옮길 수 있는 비밀 필드 평문이 있으면 설정을 읽는 명령마다 stderr 로 경고하고 고치는 명령을 안내한다 | `apiKey` 평문이 든 `config.json` 으로 `dooray project list`·`dooray config get api-key` 를 돌리면 stderr 에 필드 이름과 비밀값과 무관한 `config set` 명령이 나오고, 값은 나오지 않는다. stdout 과 종료 코드는 경고가 없을 때와 같다. 안내한 명령을 돌린 뒤에는 경고가 나오지 않는다 |
| REQ2 | macOS·Linux 에서 비밀 필드를 담은 `config.json` 의 권한이 0600 보다 넓으면 설정을 읽는 명령마다 stderr 로 경고하고 고치는 명령을 안내한다 | 비밀값이 든 0644 파일로 명령을 돌리면 권한 경고와 고치는 명령이 나온다. 비밀값이 없는 0644 파일에서는 나오지 않는다 |
| REQ3 | 경고는 설정 파일과 키체인을 바꾸지 않는다 | 경고가 난 명령 뒤에 `config.json` 의 내용·권한·수정 시각과 키체인 항목이 그대로다 |
| REQ4 | `doctor` 는 macOS 의 평문 비밀값(REQ1 대상)과, macOS·Linux 에서 비밀값을 담은 파일의 넓은 권한을 실패로 보인다 | 그 상태에서 `doctor` 의 해당 항목이 실패이고 고치는 명령이 함께 나온다. `doctor --json` 에 항목별 결과(통과·경고·실패) 목록이 담긴다 |
| REQ5 | Windows·Linux 에서는 `doctor` 가 평문 저장을 경고로 보인다. 평문 저장만으로는 명령 실행 때 알리지 않는다. 넓은 권한은 REQ2 를 따른다 | Linux 에서 0600 평문 파일로 `doctor` 를 돌리면 「평문 저장」 경고가 나오고 실패로 세지 않는다. 같은 파일로 `dooray project list` 를 돌리면 경고가 없다 |
| REQ6 | 캐시를 쓸 때 캐시 폴더는 0700, 쓴 파일은 0600 이 된다 | 0755 폴더·0644 파일인 캐시에서 프로젝트 목록 캐시를 다시 쓰면, 그 파일은 0600, 캐시 루트와 그 파일이 든 폴더는 0700 이 된다 |
| REQ7 | 캐시 권한을 맞추지 못해도 명령은 실패하지 않고 경고도 내지 않는다 | POSIX 권한이 없는 파일 시스템에서 캐시 쓰기가 성공하고 stdout·stderr·종료 코드가 같다 |
| REQ8 | 직전 실행 기록을 쓸 때 `~/.dooray` 가 없으면 0700 으로 만들고, 임시 파일 이름에 프로세스와 무작위 값을 넣는다 | `~/.dooray` 가 없는 HOME 에서 실행 기록이 쓰이면 폴더가 0700 이다. 두 프로세스가 동시에 기록해도 `last-run.json` 이 깨지지 않는다 |
| REQ9 | 키체인에 넣을 수 없는 문자가 든 구버전 평문은 명령 실행 때 알리지 않고 `doctor` 가 경고로 보인다 | 그런 `imapPassword` 만 파일에 있으면 `dooray project list` 에 경고가 없다. `doctor` 는 「키체인에 옮길 수 없어 평문으로 남은 값」 경고를 보이고 실패로 세지 않는다. 값은 나오지 않는다 |
| REQ10 | `doctor` 는 실패 항목이 하나라도 있으면 종료 코드 1 로 끝난다. 실패는 설정 파일 손상·읽기 실패, API 키·Base URL 미설정, API 연결 실패, REQ4 의 보안 항목이다. 스킬 상태는 넣지 않는다 | 위 중 하나라도 있으면 1 이다. 경고만 있거나 모두 통과면 0 이다. 스킬이 설치되지 않았어도 다른 항목이 통과면 0 이다 |

## 결정

| ID | 결정 | 답 | 누가 | 근거 |
| --- | --- | --- | --- | --- |
| DECISION1 | 평문·넓은 권한을 만났을 때 동작 | 명령마다 stderr 경고, `doctor` 는 실패. 파일은 고치지 않는다 | 사용자 2026-11-13 | 읽기 명령이 파일을 고치지 않는다는 [ADR-069](../../adr/069-macos-keychain-secret-store.md) 규칙을 지킨다 |
| DECISION2 | 캐시 권한 | 폴더 0700, 파일 0600 | 사용자 2026-11-13 | 캐시에 멤버 이름·메일과 프로젝트 목록이 있다 |
| DECISION3 | PR 순서 | 웹 방식 기능보다 먼저 별도 PR 로 낸다 | 사용자 2026-11-13 | 웹 방식과 무관하게 지금 필요한 고침이다 |
| DECISION4 | Windows 비밀값 암호화 저장 | 범위 밖, 다음 PR | 사용자 2026-11-13 | Windows 실측 환경이 없다 |
| DECISION5 | 저장소가 없는 OS 의 평문 알림 | `doctor` 경고만. Linux 의 넓은 권한은 REQ2 로 명령마다 경고하고 `doctor` 에서 실패 | 사용자 2026-11-13 | 고칠 방법이 없는 경고를 매번 띄우지 않는다 |
| DECISION6 | 권한 검사 대상 OS | macOS·Linux 만. Windows 는 POSIX 권한 검사를 하지 않는다 | 작성자 | Windows 에서 `chmod` 는 읽기 전용 표시만 바꿔 0600 판정이 뜻이 없다(`src/config/store.ts` 의 `ensureDir`) |
| DECISION7 | 권한 경고 조건 | 파일에 비어 있지 않은 비밀 필드가 있을 때만 | 작성자 | 비밀값을 키체인으로 옮긴 파일은 테넌트 이름 같은 비밀 아닌 값만 담는다 |
| DECISION8 | 고치는 명령 안내 | 비밀값과 무관한 `config set` 한 번으로 옮겨진다는 것을 안내한다 | 작성자 | 저장 때 옮기는 [ADR-069](../../adr/069-macos-keychain-secret-store.md) 경로를 그대로 쓴다. 2026-11-13 실측으로 `config set track-last-run true` 한 번에 키체인 이전과 0600·0700 이 맞춰졌다 |
| DECISION9 | 이미 있는 캐시 파일 | 다시 쓸 때 맞춘다. 일괄 변경 명령은 두지 않는다 | 작성자 | `dooray cache clear` 로 지우면 다음 조회부터 새 권한으로 생긴다 |
| DECISION10 | `doctor` 종료 코드 | 실패 항목이 있으면 1, 아니면 0. 실패는 설정 손상·읽기 실패·미설정·연결 실패·보안이고 스킬은 넣지 않는다. `--json` 에 항목별 결과 목록을 더한다 | 사용자 2026-11-13 | 지금은 늘 0 이다. 그 값을 읽는 곳은 저장소와 nhn-dev 플러그인에 없다. 화면의 ❌ 는 CLI 가 지금 동작할 수 없다는 뜻이라 스크립트가 믿고 쓸 수 있다 |
| DECISION11 | 경고하는 명령 | 설정을 읽는 명령만(`config get` 포함). 설정을 저장하는 명령은 저장 뒤 상태로 보므로 경고하지 않는다 | 작성자 | `--version`·`skill`·`cache clear` 는 비밀값을 쓰지 않는다. 안내한 고치는 명령이 경고를 다시 내면 사용자가 고쳐지지 않았다고 오해한다 |
| DECISION12 | 키체인에 넣을 수 없는 구버전 값 | 명령 실행 때는 알리지 않고 `doctor` 경고로만 보인다 | 사용자 2026-11-13 | 그 값은 `config set` 을 해도 파일에 남고(`src/config/store.ts` 의 `writeConfig`), 같은 값을 다시 넣으면 거절된다. 고칠 방법이 없는 경고를 매번 띄우지 않는다 |
| DECISION13 | 캐시 권한 실패 | 조용히 넘어간다 | 작성자 | `src/config/store.ts` 의 `ensureDir` 과 같은 처리다 |
| DECISION14 | 직전 실행 기록 | 이번 PR 에 넣는다 | 사용자 2026-11-13 | 같은 폴더를 권한 없이 만드는 경로라 함께 막는다 |

## 도메인 규칙 변경

도메인 규칙 변경 없음: 설정·캐시 파일의 저장 방식만 바꾼다.

## 결정 기록 연결 (필요할 때만)

| 결정 | 종류 | 선택 이유를 남길 ADR | 현재 규칙의 원본 |
| --- | --- | --- | --- |
| DECISION1 | security-policy | [ADR-069](../../adr/069-macos-keychain-secret-store.md) 에 「평문 발견 시 경고」 절을 더할지 technical-design 이 정한다 | `docs/adr/069-macos-keychain-secret-store.md` |
| DECISION2 | security-policy | 캐시 권한은 [ADR-004](../../adr/004-disk-cache.md)·[ADR-010](../../adr/010-cache-file-split.md) 갱신 대상인지 technical-design 이 정한다 | `docs/data-schema.md` |
