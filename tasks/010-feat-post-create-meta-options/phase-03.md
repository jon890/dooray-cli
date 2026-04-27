# Phase 3: post create 명령에 4개 옵션 통합

## 컨텍스트

Phase 1 (api/cache) + Phase 2 (resolver) 위에 사용자 인터페이스를 통합. ADR-019 결정사항을 그대로 구현.

### 먼저 읽을 파일

- `src/commands/post/create.ts` — 본 phase의 수정 대상
- `src/api/types.ts` `CreatePostRequest` — `tagIds`, `parentPostId`, `milestoneId` 필드 위치
- `src/api/client.ts` `setPostWorkflow` — workflow 후속 호출에 사용
- `src/resolvers/{tag,milestone,postRef,workflow}.ts` — phase 2에서 신설
- `docs/adr.md` ADR-019

## 변경 사양

### 명령 시그니처 추가

```
.option("--tag <name>", "태그 이름 (반복 가능)", (value, prev: string[]) => [...prev, value], [] as string[])
.option("--parent <ref>", "부모 업무 (project/number 또는 postId)")
.option("--workflow <name>", "초기 워크플로우 이름 또는 class")
.option("--milestone <name>", "마일스톤 이름")
```

`--tag`는 **반복 입력**(`--tag X --tag Y`) 형태로 받음 — commander의 `(value, prev) => [...prev, value]` 패턴. 이슈 본문이 그렇게 명시.

**참고 — 이슈 #18 본문의 `tagIdList` 오타**: API 실제 필드명은 `tagIds`. 본 task는 신규 옵션 추가이므로 `tagIdList`와의 호환성은 비대상이며, 코드는 `tagIds`를 사용한다.

### action 핸들러 변경

기존 흐름 (`subject` 검증 → `bodyContent` → spinner 시작 → projectId resolve → toUsers/ccUsers → createPost) 사이에 다음 추가:

1. **resolve 단계 (createPost 호출 전)** — 병렬 처리:

```ts
// commander variadic이 누적한 빈 문자열 제거 (입력 사고 방지)
const tagInputs = (opts.tag ?? []).filter((s: string) => s.length > 0);

const [tagIds, parentPostId, milestoneId] = await Promise.all([
  tagInputs.length > 0
    ? resolveTags(client, projectId, tagInputs)
    : Promise.resolve<string[] | undefined>(undefined),
  opts.parent
    ? resolvePostRef(client, opts.parent)
    : Promise.resolve<string | undefined>(undefined),
  opts.milestone
    ? resolveMilestone(client, projectId, opts.milestone)
    : Promise.resolve<string | undefined>(undefined),
]);
```

> `resolveTags`가 `[]`를 반환하면 옵션 미지정과 구분 — 호출 분기로 처리. 빈 배열을 body에 넣으면 안 됨.

2. **createPost body에 추가**:

```ts
const res = await client.createPost(projectId, {
  subject,
  body: { mimeType: "text/x-markdown", content: bodyContent },
  users: { to: toUsers, cc: ccUsers },
  priority: opts.priority,
  ...(opts.dueDate && { dueDate: opts.dueDate, dueDateFlag: true }),
  ...(parentPostId && { parentPostId }),
  ...(milestoneId && { milestoneId }),
  ...(tagIds && tagIds.length > 0 && { tagIds }),
});
```

3. **createPost 성공 직후 workflow 후속 호출**:

```ts
if (opts.workflow) {
  try {
    const workflowId = await resolveWorkflow(client, projectId, opts.workflow);
    await client.setPostWorkflow(projectId, res.result.id, workflowId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`⚠  워크플로우 설정 실패 (post는 생성됨): ${msg}\n`);
    // exit 0 유지 — 업무는 이미 생성됨
  }
}
```

4. **stopSpinner 위치**: createPost 직후. workflow 호출은 spinner 외부.

### 출력 (기존 그대로)

- `--json`: `printJson(res.result)`
- `--quiet`: `res.result.id`
- 기본: `업무가 생성되었습니다: {id}`

workflow 실패 시 stderr warn은 별도. exit code는 0 유지.

## 작업 목록 (3개)

### 1) import 추가

```ts
import { resolveTags } from "../../resolvers/tag.js";
import { resolveMilestone } from "../../resolvers/milestone.js";
import { resolvePostRef } from "../../resolvers/postRef.js";
import { resolveWorkflow } from "../../resolvers/workflow.js";
```

### 2) `.option()` 4개 추가 (위 시그니처대로)

`--due-date` 옵션 다음에 4개 추가. `--tag`만 collect 패턴(variadic 대신 누적), 나머지 3개는 단일 값.

### 3) action 핸들러 수정

위 사양 1-3 구현. 병렬 resolve, body 조건부 spread, workflow try/catch.

## 성공 기준

- [ ] `pnpm build` 성공
- [ ] `node dist/index.js post create --help` 출력에 `--tag`, `--parent`, `--workflow`, `--milestone` 4개 옵션 노출
- [ ] `grep -c "resolveTags\|resolveMilestone\|resolvePostRef\|setPostWorkflow" src/commands/post/create.ts` → 4 이상
- [ ] `grep -c "워크플로우 설정 실패" src/commands/post/create.ts` → 1
- [ ] `git diff --stat` — `src/commands/post/create.ts` 만 변경 (수입 import는 phase 1·2 산출물)

## 주의사항

- **`Promise.all` 병렬 resolve**: 캐시 적중률을 위해 동시 호출. 단 첫 호출 시 cache miss로 동시에 fetch될 수 있음 (race) — 멤버 캐시도 동일한 잠재 race가 있고 허용됨, 심각하지 않음
- **빈 `--tag` 배열을 body에 넣지 않기**: commander default `[]`가 옵션 미지정과 동일하게 처리되도록 `tagIds.length > 0` 체크 필수
- **workflow try/catch는 createPost 성공 후에만**: createPost 자체가 실패하면 그 에러는 그대로 throw (exit non-zero)
- **`subject`/`body-input`/`stopSpinner` 기존 흐름은 보존** — 수정 최소화
- **`opts.tag`는 commander custom collector 결과 → 항상 string[]** (옵션 미지정시 default `[]`). `length > 0`로 분기
- **mandatory 검증은 resolveTags 내부에서 자동 수행** — 명령 핸들러에서 별도 검증 코드 작성 금지

## Blocked 조건

- `CreatePostRequest`에 `tagIds`/`parentPostId`/`milestoneId` 필드 부재 → `PHASE_BLOCKED: types 정의 부재`
- `setPostWorkflow` API 메서드 부재 → `PHASE_BLOCKED: api 메서드 부재`
- phase 2의 resolver들이 미구현 → `PHASE_BLOCKED: phase 2 미완료`
