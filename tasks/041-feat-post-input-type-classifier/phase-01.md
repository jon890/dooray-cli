# Phase 01 — classifyPostInputToken 판별기 + URL 형식 확장 + resolvePostInput 타입 검증 + 단위 테스트

## 컨텍스트

Issue #82 + #83 통합. `resolvePostInput` 의 "만능 추론"이 두 이슈의 공통 근원.

**현재 문제** (`src/resolvers/post-input.ts`):
- positional 2개 경로(경로 6)에서 2번째 인자를 무조건 업무 번호(`resolvePost(projectId, num)`)로 처리.
  사용자가 internal postId(19자리)를 넣으면 번호로 오인 → `USER_INVALID_ERROR` (#82).
- URL 파싱(`src/utils/dooray-url.ts`)이 `/task/to/{id}` + `/task/{pid}/{id}` 만 인식.
  브라우저가 실제 생성하는 `/project/tasks/{id}` 거부 (#83).

**결정 방향**: 추론을 없애지 않고 **명시화**.
입력 토큰을 타입으로 분류 → 진입점별 기대 타입과 불일치 시 타입별 명확한 안내 에러.

**ADR-020 정신 유지**: positional numeric 을 postId 로 **자동 처리하지 않는다**(ID 길이 임의성으로 기각됨).
단 명백한 postId 패턴(15+자리)은 잘못된 입력으로 **명확히 거부**하고 `--id` 로 유도한다.

## 변경 파일 (정확)

```
src/resolvers/post-input.ts            (수정 — 타입 판별기 + 진입점별 검증)
src/utils/dooray-url.ts                (수정 — /project/tasks/{id} 정규식 추가)
src/resolvers/post-input.test.ts       (수정 — postId 오인 안내 / 타입 불일치 케이스)
src/utils/dooray-url.test.ts           (수정 — /project/tasks/, query 회귀 케이스)
tasks/041-feat-post-input-type-classifier/index.json   (current_phase 갱신)
```

**docs 는 phase-02 에서 일괄 반영** — 본 phase 는 코드만.

## code-review-pitfalls self-check (코드 작성 직전)

- spinner 순서: `resolvePostInput` 은 호출자에서 `startSpinner` **이전**에 호출됨(get.ts:20-26 패턴 유지). 본 변경은 resolver 내부라 spinner 무관.
- 순수 함수 분리: `classifyPostInputToken` 은 부수효과 없는 순수 함수 → 단위 테스트 직접 가능.
- 과잉 엄격 회귀 주의: 기존 정상 입력(`<project> 337`, `--id <19자리>`, `--url /task/to/{id}`)이 모두 통과해야 함. 테스트로 회귀 방지.

## 작업 항목 (5개 이하)

### 1. 타입 판별기 추가 — `src/resolvers/post-input.ts` 상단

```ts
export type PostInputTokenType = "postId" | "postNumber" | "url" | "project";

// 입력 토큰을 형태로 분류. 추론을 '명시화' 하는 단일 분류기.
// - url:        http(s):// 로 시작
// - postId:     15자리 이상 numeric (Dooray postId 는 19자리, ADR-030 의 15+ 기준과 일관)
// - postNumber: 1~14자리 양수 (업무 번호 #N)
// - project:    그 외 (프로젝트 코드)
export function classifyPostInputToken(token: string): PostInputTokenType {
  if (/^https?:\/\//.test(token)) return "url";
  if (/^\d{15,}$/.test(token)) return "postId";
  if (/^\d+$/.test(token)) return "postNumber";
  return "project";
}
```

### 2. URL 형식 확장 — `src/utils/dooray-url.ts`

`/project/tasks/{postId}` 정규식 추가. projectId 없음 → 기존 `resolveByPostId`(getPostStandalone) 경로 재사용.

```ts
// 기존 TASK_URL_RE, TASK_URL_ALT_RE 아래에 추가
// 브라우저 '프로젝트 업무 목록 → 업무 열기' URL (#83)
const TASK_PROJECT_TASKS_RE =
  /^https?:\/\/[\w.-]+\.dooray\.com\/project\/tasks\/(\d+)(?:[/?#].*)?$/;

export function parseDoorayTaskUrl(input: string): string | null {
  const m1 = TASK_URL_RE.exec(input);
  if (m1) return m1[1];
  const m2 = TASK_URL_ALT_RE.exec(input);
  if (m2) return m2[1];
  const m3 = TASK_PROJECT_TASKS_RE.exec(input);
  if (m3) return m3[1];
  return null;
}
```

**참고**: 이슈 #83 의 `/task/{pid}/{id}?workflowIds=...` 는 `TASK_URL_ALT_RE` 의 `(?:[/?#].*)?` 로 **이미 처리됨**.
→ 본 phase 에서 회귀 테스트만 추가(코드 변경 불요)해 동작을 고정한다.

### 3. resolvePostInput 진입점별 타입 검증 — `src/resolvers/post-input.ts`

각 진입점에서 `classifyPostInputToken` 으로 기대 타입을 검증한다.
불일치 시 타입별 명확한 안내 에러를 던진다.

진입점별 검증 표:

| 진입점 | 검증 대상 | 기대 타입 | 불일치 시 동작 |
|---|---|---|---|
| `--id` 단독 (경로 4) | `idOpt` | postId | `postNumber` → "`<project> <number>` 형식을 쓰세요"<br>`url` → "`--url` 을 쓰세요"<br>`project` (비숫자) → 기존 pass-through 유지 (resolveByPostId → API 404 위임) |
| positional 2개 (경로 6) | `postNumberArg` | postNumber | `postId` → **#82 안내** (아래 코드)<br>그 외 → "`<post-number>`가 올바르지 않습니다" |
| `--url` / positional URL | URL 문자열 | url | parse 실패 → **지원 형식 목록** 제시 (아래) |

기존 분기 1~3 골격은 유지한다.
- `--id` + `--url` 동시 충돌
- 옵션 + positional 동시 충돌
- `--url` 단독 처리

**positional 2개 — postId 오인 안내** (resolveProject 호출 전, API 0):

```ts
const numType = classifyPostInputToken(postNumberArg);
if (numType === "postId") {
  throw new DoorayCliError(
    `"${postNumberArg}" 는 내부 ID(postId)로 보입니다.\n` +
    `업무 번호(#N)가 아닌 내부 ID 로 조회하려면 --id 옵션을 사용하세요:\n` +
    `  dooray post get --id ${postNumberArg}`,
    EXIT_PARAM_ERROR,
  );
}
if (numType !== "postNumber") {
  throw new DoorayCliError(
    `<post-number>가 올바르지 않습니다: "${postNumberArg}"`,
    EXIT_PARAM_ERROR,
  );
}
// 이후 기존 resolveProject → resolvePost 경로
```

**URL parse 실패 — 지원 형식 목록**:

```
예: https://x.dooray.com/task/to/{postId}
    https://x.dooray.com/task/{projectId}/{postId}
    https://x.dooray.com/project/tasks/{postId}
```

### 4. 단위 테스트 — `post-input.test.ts` + `dooray-url.test.ts`

`post-input.test.ts`:
- positional 2번째가 15+자리 numeric → `--id` 안내 에러 (`rejects.toThrow(/--id/)`)
- `--id` 에 업무 번호(짧은 numeric) → `<project> <number>` 안내 에러
- 기존 정상 케이스 회귀: `<project> 337`, `--id <19자리>`, `--url /task/to/{id}` 통과
- **기존 테스트 교체 (회귀 방지, critic 노트)**: 현재 `--id 999` 정상 케이스 (line 57-64) 는
  3자리라 신규 guard 에서 `postNumber` 로 분류돼 깨진다.
  → `--id` 정상 케이스의 입력값과 standalone mock `id` 를 **19자리 postId** 로 함께 교체한다.
  (line 50-54 의 `--url .../task/to/999` 는 URL 경로라 classifier 무관 — 유지)

`dooray-url.test.ts`:
- `/project/tasks/{id}` → postId 반환
- `/task/{pid}/{id}?workflowIds=a,b,c` → postId 반환 (query 무시 회귀)
- `classifyPostInputToken` 4 타입 각각 (선택: post-input.test 에 포함)

### 5. 빌드·테스트 검증

```bash
pnpm tsc --noEmit && pnpm test && pnpm run build
```

## 검증 기준

- `pnpm test` 신규 케이스 포함 전부 통과
- `dooray post get <project> <19자리-postId>` → `--id` 안내 에러 출력 (USER_INVALID 아님)
- `dooray post get --url "https://<tenant>.dooray.com/project/tasks/<postId>"` → 정상 조회
- 기존 입력 형식 회귀 0
