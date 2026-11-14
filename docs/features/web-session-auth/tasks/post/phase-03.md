# Phase 03. 기존 명령을 연결하고 지원 범위를 검증한다

**Execution profile**: standard

## 목표

기존 post 명령을 웹 구현에 연결하고, 미지원 옵션을 호출 전에 막으며 인수 검증을 마친다.

**범위 외**: 다른 영역의 명령·지원 목록, PR1 인터페이스 재설계, 머지·배포·npm 릴리스.

## 컨텍스트

**요구사항**: REQ6, REQ7, REQ8, REQ17

**근거 문서**: `docs/features/web-session-auth/spec.md`, `docs/features/web-session-auth/design.md`, `docs/api/web-endpoints/post.md`

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

### 1. 이미 연결된 명령의 웹 쓰기 조건을 검사한다

PR1이 createClient와 resolver 인터페이스 연결을 이미 완료했다.
이 PR은 그 교체를 반복하지 않는다.
post edit의 웹 방식은 상위 업무의 프로젝트를 updatePost 전에 확인한다.
다른 프로젝트를 상위로 지정하면 본문도 바꾸지 않고 종료 코드 3으로 끝낸다.
공개 타입과 웹 상세의 fileIdList는 유지한다.
댓글 파일 delete는 지울 파일 ID를 updatePostComment의 선택 인자로 넘기고, 웹 구현은 기존 연결에서 해당 ID만 뺀다.
공개 API 키 방식은 기존 인자와 본문을 유지한다.

### 2. 지원 목록과 사용 안내를 맞춘다

PR1이 만든 `src/commands/web-support/post.ts`의 빈 목록에 실제로 연결한 post 명령을 등록한다.
상위 변경은 추가 실측에서 확인했으므로 post edit --parent도 지원한다.
다른 미지원 옵션을 실측에서 확인하면 같은 목록과 가이드 표에 추가한다.
post get·list·search·create·edit·replace·done·workflow·댓글 latest·댓글 첨부·업무 첨부 명령 경로를 소스의 실제 Commander 나무와 대조한다.
`src/api/web/index.ts`의 post 등록 한 줄을 바꾼다.

PR1이 만든 `docs/guide/setup.md`의 「업무」 절만 고쳐 미지원 옵션과 웹 응답에서 빠지는 필드를 기록한다.
README·SKILL·common.md의 링크는 PR1이 이 가이드로 통일하므로 이 PR에서 고치지 않는다.
web-endpoints.md의 post 색인 줄은 PR1이 이미 만들었으므로 변경하지 않는다.
댓글 목록의 첫 조회가 큰 대화에서 오래 걸릴 수 있음을 설명한다.
지원 목록과 이 가이드의 표가 같은지 테스트한다.
필드 생략은 mailUsers 등 실측에서 없는 필드에 한정하고 관측하지 않은 값을 만들어 내지 않는다.

기존 `src/commands/web-support.test.ts`가 지원 목록과 가이드 표의 일치를 검사한다.
같은 검사를 새 테스트 파일로 반복하지 않는다.

### 3. `src/commands/web-support.test.ts`에 옵션 판정 회귀 테스트를 추가한다
승인된 공용 guardWebCommand를 고쳐 getOptionValueSource(key)가 cli인 옵션만 미지원 옵션 판정에 넘긴다.
기본값이 있는 미지원 옵션의 생략·명시 사례를 기존 공용 테스트에 추가한다.
API 키 방식은 순수 판정 함수를 직접 부르거나 store를 mock하고 실제 사용자 설정을 읽지 않는다.
명령 테스트는 src/commands에 둔다.
post edit의 같은 프로젝트 상위 변경과 다른 프로젝트의 쓰기 전 거절을 기존 명령 테스트에 추가한다.

### 4. 독립 검증과 문서 정리를 마친다

인수 검증 계획을 실행하고 REQ6·REQ7·REQ8 증거를 PR 본문에 연결한다.
웹 방식으로 실행한 명령과 만들고 지운 데이터를 기록한다.
검토자는 코디네이터가 배정한다. 이 worker는 별도 worker나 하위 에이전트를 띄우지 않는다.
실행 결과와 계획이 다르면 이 계획과 실측 기록을 고친 뒤 재검증한다.
문서 정리에서는 이번 구현과 가이드의 불일치를 고치고 공통화 후보가 없으면 없다고 기록한다.
기능·인수 검증이 끝나면 이 폴더의 index.json을 completed로 바꾸고 phase 완료 상태를 반영한다.

## 검증

```bash
# cwd: 저장소 루트
pnpm exec vitest run src/commands/web-support.test.ts src/commands/post/edit.test.ts
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
| `src/commands/web-support.ts` | 수정 (명시한 CLI 옵션만 판정하는 승인된 공용 변경) |
| `src/commands/web-support.test.ts` | 수정 (기본값·명시 옵션의 판정 회귀 검사) |
| `docs/guide/setup.md` | 수정 (업무 절의 지원 범위·생략 필드 안내) |
| `docs/api/web-endpoints/post.md` | 수정 (구현 뒤 재확인한 경로·사례) |
| `docs/features/web-session-auth/tasks/post/index.json` | 수정 (완료 상태) |
| `docs/features/web-session-auth/tasks/post/verification-result.md` | 신규 (실행 결과와 문서 대조 근거) |
