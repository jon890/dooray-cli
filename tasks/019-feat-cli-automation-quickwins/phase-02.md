# Phase 02 — Dooray URL 파싱 `/task/<projectId>/<postId>` 형 추가

## 컨텍스트

GitHub Issue #35 의 4번 항목. `dooray post get "https://<tenant>.dooray.com/task/3052841357365230129/4301717914215750193"` 가 reject 됨. 현재 regex 는 `/task/to/<id>` 만 허용.

코드 현황:
- `src/utils/dooray-url.ts` — `TASK_URL_RE = /^https?:\/\/[\w.-]+\.dooray\.com\/task\/to\/(\d+)(?:[/?#].*)?$/` (단일 패턴)
- `src/utils/dooray-url.test.ts` — 7 케이스 (정상/query/hash/trailing slash/non-dooray host/wrong path/non-URL)
- 소비자: `src/resolvers/post-input.ts:67, 84` — `parseDoorayTaskUrl(url)` 호출 후 string | null 처리

직전 plan 과의 관계: 016 (post 12-command input) 가 `parseDoorayTaskUrl` 의 호출처를 통합. 시그니처는 그대로 두고 regex 만 확장하면 호출처 변경 불필요.

```bash
# cwd: /Users/nhn/personal/dooray-cli
git log origin/main --oneline -10 -- src/utils/dooray-url.ts src/utils/dooray-url.test.ts src/resolvers/post-input.ts
# 기대: 2700778 (12-command input) + 초기 도입 commit
```

## 변경 파일 (정확)

```bash
# cwd: /Users/nhn/personal/dooray-cli
git diff <base>..HEAD --name-only -- src/utils/
```

기대 결과 (총 2 파일):
```
src/utils/dooray-url.ts
src/utils/dooray-url.test.ts
```

## 작업 항목

### 1. `src/utils/dooray-url.ts` — regex 2종 매칭

기존 `TASK_URL_RE` 옆에 alt-form regex 추가. `parseDoorayTaskUrl` 은 두 패턴을 순차 매칭.

```ts
const TASK_URL_RE = /^https?:\/\/[\w.-]+\.dooray\.com\/task\/to\/(\d+)(?:[/?#].*)?$/;
// alt: /task/<projectId>/<postId> form (자체 호스팅 / 브라우저 주소창 복사)
const TASK_URL_ALT_RE = /^https?:\/\/[\w.-]+\.dooray\.com\/task\/(\d+)\/(\d+)(?:[/?#].*)?$/;

export function parseDoorayTaskUrl(input: string): string | null {
  const m1 = TASK_URL_RE.exec(input);
  if (m1) return m1[1];
  const m2 = TASK_URL_ALT_RE.exec(input);
  if (m2) return m2[2]; // postId 만 반환 (projectId 는 path[1])
  return null;
}
```

**중요**: alt-form 은 `/task/<projectId>/<postId>` 이므로 `m2[2]` (두 번째 그룹) 가 postId. 첫 번째 그룹은 projectId 지만 기존 contract 가 string | null 단일 반환이므로 postId 만 반환. `resolvePostInput` 이 postId 로 projectId 를 별도 lookup 하는 흐름이 이미 있어 추가 변경 불필요.

`isLikelyDoorayUrl` 은 변경 없음 (단순 http(s) prefix 체크).

### 2. `src/utils/dooray-url.test.ts` — 케이스 4종 추가

```ts
it("/task/<projectId>/<postId> 형 URL 에서 postId 추출", () => {
  expect(parseDoorayTaskUrl("https://nhnent.dooray.com/task/3052841357365230129/4301717914215750193"))
    .toBe("4301717914215750193");
});
it("/task/<projectId>/<postId> 형도 query string 무시", () => {
  expect(parseDoorayTaskUrl("https://x.dooray.com/task/123/456?ref=foo"))
    .toBe("456");
});
it("/task/<projectId>/<postId> 형도 trailing slash 허용", () => {
  expect(parseDoorayTaskUrl("https://x.dooray.com/task/123/456/")).toBe("456");
});
it("/task/<projectId>/<postId> 형도 dooray.com 도메인 외 reject", () => {
  expect(parseDoorayTaskUrl("https://other.com/task/123/456")).toBeNull();
});
```

## 성공 기준

```bash
# cwd: /Users/nhn/personal/dooray-cli

# 1. 빌드 + 테스트 통과
pnpm build && pnpm test
# 기대: exit 0, dooray-url.test.ts 의 테스트 케이스 수가 +4 증가

# 2. 신규 regex 추가 확인
grep -nE "TASK_URL_ALT_RE|/task/\\\\d\\+/\\\\d\\+" src/utils/dooray-url.ts
# 기대: 1줄 이상 매칭

# 3. 신규 테스트 케이스 추가 확인
grep -cE "/task/<projectId>/<postId> 형|task/3052841357365230129/4301717914215750193" src/utils/dooray-url.test.ts
# 기대: 1 이상

# 4. 기존 케이스 회귀 없음 — 기존 7 케이스 + 신규 4 = 총 11 케이스
grep -cE "^\s*it\(" src/utils/dooray-url.test.ts
# 기대: 11
```

## 작업 외 금지

- `parseDoorayTaskUrl` 시그니처 변경 금지 (현재 string | null 유지)
- projectId 도 같이 반환하도록 튜플 변경 금지 (이번 phase scope 외)
- wiki URL 파서 추가 금지
- `isLikelyDoorayUrl` 변경 금지

## 커밋

phase 작업 완료 후 단일 commit:

```bash
# cwd: /Users/nhn/personal/dooray-cli
# branch: feat/019-feat-cli-automation-quickwins
git add src/utils/dooray-url.ts src/utils/dooray-url.test.ts
git commit -m "feat(utils): accept /task/<projectId>/<postId> URL form

Issue #35 item 4: self-hosted Dooray URLs (browser address bar copy)
use /task/<projectId>/<postId> path. Add second regex; postId is the
last numeric segment. Existing /task/to/<id> form preserved."
```
