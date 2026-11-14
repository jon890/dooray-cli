# R2 공개 구현 분할 검증 기록

완료: PR 전 실행 검증과 문서 대조. 독립 리뷰는 PR 본문의 완료 근거 블록에서 따로 갱신한다.

- 스펙: [spec.md](spec.md)
- 기술 설계: [design.md](design.md)
- 계획·인수 검증 계획: `tasks/r2/`
- 환경: macOS, Node.js v24.22.1, pnpm 12.18.0. 테스트는 mock 과 임시 디렉터리만 쓴다.
- 기준: R1 이 머지된 origin/main 을 수정 전에 빌드하고 도움말·테스트 수·인벤토리 출력을 모았다.
- 검증 커밋: PR 본문의 완료 근거 블록에 현재 HEAD 를 기록한다.

## 요구사항별 증거

| 요구사항 | 명령·절차 | 기대 결과 | 실제 결과 |
| --- | --- | --- | --- |
| REQ1 | 기준과 작업 브랜치에서 `pnpm test` | 기존 테스트를 유지하고 모두 통과 | 2,309개에서 2,320개로 증가, 모두 통과 |
| REQ1 | 양쪽 `pnpm run build`, `node scripts/help-snapshot.mjs --check <기준 파일>` | 모든 명령 도움말 일치 | 104개 명령 경로 일치 |
| REQ2 | 기준과 작업 브랜치의 `pnpm api:inventory` 출력 비교, 옛 추출 함수와 새 추출 함수의 endpoint 목록 비교 | 출력이 같다 | 출력 diff 없음. 구현 endpoint 61건과 읽지 못한 호출 2건, 목록이 모두 같다 |
| REQ3 | `src/api/client.ts` 와 `architecture.test.ts` | 구현이 영역 `public.ts` 에 있고 client.ts 는 재내보내기만 | 1218줄이 9줄(재내보내기)로 줄었다. 영역 7개의 `public.ts` 와 `api/public/` 이 구현을 가진다 |
| REQ4 | `createPublicClient` 에서 `createStreamPublic` 한 줄을 빼고 `pnpm tsc --noEmit` | 컴파일 실패 | 실패(`getStreams` 가 `StreamClient` 에 없다는 TS2322). 되돌린 뒤 통과 |
| REQ4 | 공개 영역 구현 7개의 메서드 이름 충돌 검사(`dooray-client.test.ts`) | 겹침 없음, 조립 결과의 키와 같음 | 통과 |
| REQ4 | `architecture.test.ts` | 공개·웹 상호 import 0건, resolvers·services 의 `dooray-client` import 는 허용 목록 9건뿐 | 통과 |
| REQ8 | `git diff -M --summary` 로 이동 커밋 확인 | 이동 파일 8개가 100% rename | 구현 4개와 짝 테스트 4개가 100% rename |

## 개발 검증

| 명령 | 결과 |
| --- | --- |
| `pnpm test` | 148개 파일, 2,320개 테스트 통과 |
| `pnpm tsc --noEmit` | 통과 |
| `pnpm run build` | 통과 |
| `pnpm verify:package` | 통과 |
| `pnpm api:inventory` | 통과, 기준과 출력 일치 |
| `node scripts/check-pii.mjs` | 통과 |
| `node scripts/check-public-refs.mjs` | 통과 |
| `node scripts/check-doc-paths.mjs` | 기존 12건 그대로(이번 PR 이 옮긴 파일을 가리키는 낡은 경로 없음) |
| `git diff --check` | 통과 |

실제 Dooray API·웹·SMTP·IMAP 은 부르지 않았다.

## 기술 결정

| 결정 | 선택과 이유 |
| --- | --- |
| 파일 서버 요청 도우미 | `requestFileServer`·`followDownloadRedirect` 를 `PublicHttp` 의 메서드로 둔다. 영역 파일이 `http` 하나만 받으면 되고, 두 도우미가 `authHeader`·`baseUrl` 을 쓰기 때문이다. 오류 변환 `toDoorayCliError` 와 `fileStatusExitCode` 는 같은 파일의 함수로 내보낸다 |
| 영역 안 메서드 호출 | `downloadPostFile` 의 목록 재조회와 `downloadWikiPageFile` 의 페이지 재조회는 영역 구현 안의 `client` 상수를 거친다. 동작은 그대로다 |
| `joinIds` | `getPosts` 만 쓰므로 `post/public.ts` 안의 함수로 둔다 |
| `collectWikiPages` 의 인자 | 설계는 `WikiClient` 이고, 쓰는 메서드가 `getWikiPages` 하나라 `Pick<WikiClient, "getWikiPages">` 로 받는다. `WikiClient` 가 그대로 들어가고 테스트 mock 이 작아진다 |
| 인벤토리 호출 꼴 | 옛 `this.api`·`${this.baseUrl}` 꼴은 읽지 않는다. 읽을 파일이 `api/public/` 과 `api/*/public*.ts` 로 바뀌어 옛 꼴이 남을 곳이 없다 |
| 인벤토리 변경 커밋 | 분할과 한 커밋에 둔다. 호출 꼴이 분할과 함께 바뀌므로 따로 두면 사이 커밋에서 인벤토리가 빈다 |
| 메일 이동 | `move-paths.mjs` 를 고치지 않고 그대로 썼다. 설계 목록의 `uid-lookup.ts` 는 R3 몫이라 만들지 않았다 |

## 문서 정합성과 공통화 후보

| 문서 | 영향 | 대조 결과 |
| --- | --- | --- |
| spec.md | 요구사항·사용자 결정 유지 | R2 부분 범위와 일치 |
| design.md | 공개 구현의 꼴, 인벤토리 호출 꼴, 메일 파일 이동 | 설계와 구현이 같다. 바꾼 결정은 위 표 |
| `docs/code-architecture.md` | 공개 구현 구조, 메일 경로, resolvers·services 규칙 | 구현과 규칙 테스트에 맞게 수정 |
| ADR 적용 범위 | `src/api/client.ts` 로 적힌 메서드 위치, 인벤토리 읽는 범위 | 새 경로로 고침. 결정과 근거는 그대로 |
| [ADR-082](../../adr/082-code-structure.md) | 공개 구현 분할 | 결정 변경 없음 |
| PRD·flow·data-schema | 사용자 명령·저장 형식 유지 | 영향 없음 |

후보 없음: 공개 구현의 분할이 코드 배치만 바꾸고 도메인 규칙은 바꾸지 않는다.

## 남은 일

- 독립 리뷰(Codex 리뷰 worker)와 그 반영.
- R3(utils 재분류와 `body/`, uid-lookup 분리), R4(명령 파일 로직 분리, 허용 목록 비우기), R5(선택).
