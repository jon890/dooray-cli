# Phase 03. 기존 명령을 연결하고 지원 범위를 검증한다

**Execution profile**: standard

## 목표

기존 post 명령을 웹 구현에 연결하고, 미지원 옵션을 호출 전에 막으며 인수 검증을 마친다.

**범위 외**: 다른 영역의 명령·지원 목록, PR1 인터페이스 재설계, 머지·배포·npm 릴리스.

## 컨텍스트

**요구사항**: REQ6, REQ7, REQ8, REQ17

**근거 문서**: `docs/features/web-session-auth/spec.md`, `docs/features/web-session-auth/design.md`, `docs/api/web-endpoints/post.md`, `docs/guide/post-wiki.md`

PR1이 `src/api/post/types.ts`의 PostClient와 클라이언트 합성 구조를 제공한다.
영역별 지원 목록은 `src/commands/web-support/post.ts`에 둔다.
`src/api/web/index.ts`에서는 post의 미지원 기본값을 영역 구현으로 바꾸는 줄만 고친다.
다른 영역 등록 줄과 공용 판정 함수를 바꿔야 하면 코디네이터에게 묻는다.

## 의도 메모

- 명령이 `DoorayApiClient`를 직접 만들던 부분을 PR1의 createClient로 바꾸고 API 키 방식의 기존 동작을 유지한다.
- `src/resolvers/template.ts`의 기존 캐시와 템플릿 우선순위 규칙을 유지한다. 템플릿 내용·참여자를 바꾸는 새 규칙은 만들지 않는다.
- 지원 여부는 명령 시작에서 검사한다. 연결하지 않은 명령이 일부 쓰기를 수행한 뒤 미지원 오류를 내게 두지 않는다.
- 실제 웹 쓰기는 로컬 phase 검증 명령에 넣지 않는다. 인수 검증 표의 제한된 장소에서만 실행한다.

## 작업 항목

### 1. 명령과 resolver의 클라이언트 경계를 바꾼다

`src/commands/post/`의 실제 명령 파일을 찾아 createClient를 사용하게 한다.
PR1에서 이미 바꾼 파일은 중복 수정하지 않는다.
`src/resolvers/post.ts`, `post-input.ts`, `postRef.ts`, `post-users.ts`, `comment-file-input.ts`, `task-link.ts`, `template.ts`는 PR1이 인터페이스 매개변수로 이미 바꿀 예정이다.
이 PR에서는 변경 없음으로 예상하며 main의 실제 타입을 확인한다.
추가 변경이 필요하면 담당 범위를 먼저 확인한다.
메서드 이름을 Pick으로 다시 나열하지 않는다.

공개 타입과 웹 상세 모두의 fileIdList를 유지해 post file download-all의 기존 소속 검사 로직을 그대로 사용한다.

### 2. 지원 목록과 사용 안내를 맞춘다

PR1이 만든 `src/commands/web-support/post.ts`의 빈 목록에 실제로 연결한 post 명령을 등록한다.
상위 변경은 추가 실측에서 확인했으므로 post edit --parent도 지원한다.
다른 미지원 옵션을 실측에서 확인하면 같은 목록과 가이드 표에 추가한다.
post get·list·search·create·edit·replace·done·workflow·댓글 latest·댓글 첨부·업무 첨부 명령 경로를 소스의 실제 Commander 나무와 대조한다.
`src/api/web/index.ts`의 post 등록 한 줄을 바꾼다.

PR1이 만든 `docs/guide/setup.md`의 「업무」 절만 고쳐 미지원 옵션과 웹 응답에서 빠지는 필드를 기록한다.
README·SKILL·common.md의 링크는 PR1이 이 가이드로 통일하므로 이 PR에서 고치지 않는다.
`docs/api/web-endpoints.md`에서는 post 실측 문서로 연결하는 색인 줄만 고친다.
댓글 목록의 첫 조회가 큰 대화에서 오래 걸릴 수 있음을 설명한다.
지원 목록과 이 가이드의 표가 같은지 테스트한다.
필드 생략은 mailUsers 등 실측에서 없는 필드에 한정하고 관측하지 않은 값을 만들어 내지 않는다.

`src/commands/post/web-support.test.ts`에서 명령별 지원 여부와 setup.md 업무 표의 일치, 아직 지원하지 않는 경로의 HTTP 호출 전 차단을 검사한다.
API 키 방식은 순수 판정 함수를 직접 부르거나 store를 mock하여 실제 사용자 설정을 읽지 않고 검사한다.
명령 테스트는 src/commands에 둔다.
기존 명령 회귀 테스트로 상위 변경과 본문 수정을 함께 요청한 정상 경로도 확인한다.

### 3. 독립 검증과 문서 정리를 마친다

인수 검증 계획을 실행하고 REQ6·REQ7·REQ8 증거를 PR 본문에 연결한다.
웹 방식으로 실행한 명령과 만들고 지운 데이터를 기록한다.
검토자는 코디네이터가 배정한다. 이 worker는 별도 worker나 하위 에이전트를 띄우지 않는다.
실행 결과와 계획이 다르면 이 계획과 실측 기록을 고친 뒤 재검증한다.
문서 정리에서는 이번 구현과 가이드의 불일치를 고치고 공통화 후보가 없으면 없다고 기록한다.
기능·인수 검증이 끝나면 이 폴더의 index.json을 completed로 바꾸고 phase 완료 상태를 반영한다.

## 검증

```bash
# cwd: 저장소 루트
pnpm exec vitest run src/commands/post/web-support.test.ts
pnpm test
pnpm tsc --noEmit
pnpm run build
pnpm api:inventory
pnpm verify:package
node scripts/check-pii.mjs
node scripts/check-public-refs.mjs
```

필수 검증은 모두 통과해야 한다.
공개 API inventory는 기존 client.ts의 정적 검사이므로 웹 endpoint 지원 증거로 사용하지 않는다.
실제 경로·옵션 지원은 웹 변환 테스트와 인수 검증 결과로 증명한다.
원격 CI·리뷰·실제 웹 결과는 인수 검증 계획에 따라 확인한다.

## 변경 파일

| 파일 | 변경 |
| --- | --- |
| `src/api/web/index.ts` | 수정 (post 등록 한 줄) |
| `src/commands/web-support/post.ts` | 수정 (PR1이 만든 영역 목록에 실제 지원 명령 등록) |
| `src/commands/post/**/*.ts` | 수정 (기존 명령의 클라이언트 생성과 회귀 테스트) |
| `src/commands/post/web-support.test.ts` | 신규 (지원 목록·가이드·호출 전 차단 검사) |
| `docs/guide/setup.md` | 수정 (업무 절의 지원 범위·생략 필드 안내) |
| `docs/api/web-endpoints.md` | 수정 (post 문서로 연결하는 색인 줄) |
| `docs/api/web-endpoints/post.md` | 수정 (구현 뒤 재확인한 경로·사례) |
| `docs/features/web-session-auth/tasks/post/index.json` | 수정 (완료 상태) |
