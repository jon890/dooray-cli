## ADR-080: 설정 파일의 평문 비밀값과 넓은 권한은 고치지 않고 경고하며, 캐시는 본인만 읽게 쓴다

- **status**: `accepted`
- **decision-type**: `architecture`
- **areas**: `security`
- **현재 규칙의 원본**: 판정은 `src/config/file-security.ts`, 경고는 `src/config/store.ts` 의 `getConfigOrThrow`, 종료 코드는 `src/commands/doctor.ts`, 캐시 권한은 `src/cache/store.ts`. 요구사항은 [비밀값·캐시 파일 보호 강화 스펙](../features/secret-file-hardening/spec.md)
- **결정**: `config.json` 에 비밀값이 평문으로 남아 있거나(macOS), 비밀값을 담은 파일의 권한이 0600 보다 넓으면(macOS·Linux) 설정을 읽는 명령마다 stderr 로 경고하고 고치는 명령을 안내한다. 파일은 고치지 않는다.
  `doctor` 는 같은 상태를 실패로 보이고, 실패가 하나라도 있으면 종료 코드 1 로 끝난다. 고칠 방법이 없는 평문(비밀 저장소가 없는 OS, 키체인에 넣을 수 없는 문자가 든 값)은 `doctor` 경고로만 보인다.
  `doctor` 의 실패는 설정 손상·읽기 실패, API 키·Base URL 미설정, API 연결 실패, 위 보안 상태다. 스킬 상태는 넣지 않는다.
  캐시와 직전 실행 기록은 폴더 0700, 파일 0600 으로 tmp 파일에 쓴 뒤 rename 한다.
- **맥락**: [ADR-069](069-macos-keychain-secret-store.md) 는 비밀값을 저장할 때만 키체인으로 옮긴다.
  2026-11-13 개발자 PC 에서 CLI 가 아닌 무언가가 `config.json` 을 0644 로 썼고, 그 뒤 CLI 저장이 없어 `apiKey`·`imapPassword` 평문이 다른 계정에 읽히는 채로 남았다.
  CLI 는 이 상태를 알리지 않았다. `doctor` 도 문제를 찾아도 늘 0 으로 끝나 자동화가 잡을 수 없었다.
  같은 PC 의 캐시는 0755·0644 로 멤버 이름·메일과 프로젝트 목록을 다른 계정에 보였다.
- **대안 기각**:
  - **읽을 때 자동으로 옮기고 권한을 맞추기** — 조회 명령이 설정 파일을 고치게 된다. [ADR-069](069-macos-keychain-secret-store.md) 가 같은 이유로 기각했다. 동시에 도는 CLI 들이 같은 파일을 쓰는 경쟁도 생긴다.
  - **`doctor` 에서만 알리기** — `doctor` 를 돌리지 않으면 모른다. 이번 사례가 그랬다.
  - **고칠 방법이 없는 평문에도 명령마다 경고** — 비밀 저장소가 없는 OS 나 키체인에 넣을 수 없는 값은 `config set` 으로 풀리지 않는다. 꺼지지 않는 경고가 매번 떠서 다른 경고까지 무시하게 만든다.
  - **`doctor` 를 늘 0 으로 두기** — 자동화가 출력 문구나 `--json` 을 해석해야 문제를 안다.
  - **스킬 미설치도 종료 코드에 넣기** — CLI 는 스킬 없이 동작한다. 동작을 막는 문제만 실패로 센다.
- **결과**:
  - 얻는 것: 평문과 넓은 권한이 생긴 다음 명령에서 사용자가 알아챈다. `dooray doctor` 의 종료 코드로 CI 와 스크립트가 확인할 수 있다. 캐시의 사내 정보가 다른 계정에 보이지 않는다.
  - 감당할 것: 고치기 전까지 명령마다 stderr 에 경고가 나온다. 설정을 읽는 명령마다 config.json 읽기와 stat 이 한 번씩 더 든다. `doctor` 종료 코드가 0 에서 1 로 바뀌는 환경이 생긴다. 이미 있는 캐시 파일은 다시 쓸 때까지 예전 권한으로 남는다. Windows 는 POSIX 권한을 보지 않는다.
    macOS 와 Linux 가 같은 `config.json` 을 동기화하면 경고대로 `config set` 을 돌린 순간 파일에서 평문이 빠져 Linux 쪽이 「설정 미완료」 가 된다. [ADR-069](069-macos-keychain-secret-store.md) 가 감수한 동작을 이 경고가 권하게 된다.
    POSIX 권한이 늘 넓게 보이는 파일 시스템에서는 `config set` 으로도 권한 경고가 풀리지 않는다.
    손상된 `config.json` 의 JSON 파싱 오류는 Node 가 원문 앞뒤를 발췌해 따옴표 없는 비밀값 앞부분이 stderr·`doctor`·실행 기록에 나갈 수 있었다. 그래서 원문 없이 줄·글자 위치만 남긴다.
- **확인 방법**: `src/config/file-security.test.ts` 가 OS·권한·비밀 필드 조합을, `src/commands/doctor.test.ts` 가 종료 코드를, `src/cache/store.test.ts` 가 캐시 권한을 본다. `src/config/store.security.test.ts` 는 읽기 경고와 저장 후 해소를, `src/cache/last-run.test.ts` 는 실행 기록 권한과 동시 쓰기를 본다. 설계의 근거는 [기술 설계](../features/secret-file-hardening/design.md)다.
