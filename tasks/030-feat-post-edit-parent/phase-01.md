# Phase 01 — `post edit --parent <ref>` 옵션 + `setPostParent` 호출

## 컨텍스트

GitHub Issue #60 — `post edit` 에 상위 업무 변경 옵션 부재. `post create --parent` 는 지원되지만 edit 시점에 부모-자식 재구성 불가.

**cmux-browser spike 결과** (2026-05-11):
- Dooray 공식 API: `POST /project/v1/projects/{projectId}/posts/{postId}/set-parent-post` 존재. Body: `{ "parentPostId": "1" }`
- **unset-parent-post / remove-parent / clear-parent endpoint 부재** → CLI 로 parent 해제 (top-level 화) 불가. 본 task 는 `--parent-clear` 제외, `--parent <ref>` 만 구현
- API 제약: "계층 구조 설정 불가 — 상위업무를 가진 하위업무를 상위로 설정 못 함" (Dooray 서버가 거부)

코드 현황 — 모두 인프라 존재:
- `src/api/client.ts:271` — `setPostParent(projectId, postId, parentPostId): Promise<DoorayApiUnitResponse>`
- `src/api/types.ts:258` — `SetParentPostRequest { parentPostId: string }`
- `src/resolvers/postRef.ts` — `resolvePostRef(client, ref)` (`project/number` 또는 raw postId)
- `src/commands/post/edit.ts:35-50` — postEditCommand 옵션 정의 위치
- `src/commands/post/edit.ts:127-152` — non-interactive 의 `client.updatePost` payload 합성 (parentPostId 무관)
- 패턴 답습: `post create` 가 `--workflow` 후속 호출하는 흐름 (setPostWorkflow 별도 호출 — line 174-180 부근)

직전 plan 과의 관계: 027 (post cc/to + group) 이 post edit 의 옵션 흐름 + interactive 모드 경고 패턴 확립. 본 plan 은 동일 패턴 답습 + setPostParent 추가 endpoint 호출만.

```bash
# cwd: /Users/nhn/personal/dooray-cli
git log origin/main --oneline -10 -- src/commands/post/edit.ts src/api/client.ts
```

## 변경 파일 (정확)

```bash
# cwd: /Users/nhn/personal/dooray-cli
git diff <base>..HEAD --name-only -- src/commands/post/edit.ts
```

기대 결과 (총 1 파일):
```
src/commands/post/edit.ts
```

## 작업 항목

### 1. 옵션 정의 추가

`postEditCommand` 옵션 정의 (`--cc` / `--cc-group` / `--no-confirm` 옆에 추가):

```ts
.option("--parent <ref>", "상위 업무 변경 — project/number 또는 raw postId (post create 와 동일 — unset 은 미지원, 웹 UI 에서 처리)")
```

### 2. action 안에서 처리

post create 의 `--workflow` 후속 호출 패턴 답습. `client.updatePost` 호출 후 `--parent` 가 있으면 `setPostParent` 추가 호출.

```ts
import { resolvePostRef } from "../../resolvers/postRef.js";

// non-interactive 분기 — client.updatePost 직후, dry-run 체크 이후
if (opts.parent && !opts.dryRun) {
  startSpinner("상위 업무 변경 중...");
  const newParentPostId = await resolvePostRef(client, opts.parent);
  await client.setPostParent(projectId, postId, newParentPostId);
  stopSpinner(true, "상위 업무 변경 완료");
}
```

**호출 순서**: `client.updatePost` (subject/body/users) → `client.setPostParent` (parent). 둘 다 무관 endpoint 라 atomic 보장 없음 — `updatePost` 가 성공하고 `setPostParent` 가 실패해도 body 변경은 유지됨. partial 실패 stderr 안내는 setPostParent 의 catch 가 자동 처리 (toDoorayCliError → DoorayCliError throw + non-zero exit).

### 3. interactive ($EDITOR) 모드 경고

`opts.parent` 가 있고 interactive 분기로 들어가면 stderr 경고 + 옵션 무시 (mention/link-task/cc 패턴 답습):

```ts
// interactive 분기 진입 직전 또는 안:
if (opts.parent) {
  process.stderr.write(
    "⚠  --parent 는 --title/--body 와 함께 사용 시에만 적용됩니다.\n",
  );
}
```

### 4. dry-run 처리

`opts.dryRun` 모드는 API 미호출. parent 변경은 main payload 와 별도 endpoint 호출이라 본문 출력만으로 충분. 단 JSON 출력에는 명시:

```ts
if (opts.dryRun) {
  const globalOpts = postEditCommand.optsWithGlobals() as OutputOptions;
  const previewBody = newBody ?? post.body.content;
  if (globalOpts.json) {
    process.stdout.write(JSON.stringify({
      body: previewBody,
      users: { to: toUsers, cc: ccUsers },
      ...(opts.parent && { parentChange: opts.parent }),
    }) + "\n");
  } else {
    process.stdout.write(previewBody + "\n");
  }
  return;
}
```

### 5. 동작 실증 (필수)

```bash
# cwd: /Users/nhn/personal/dooray-cli
pnpm build

# 1) 자식 업무 1개 + 부모 후보 1개 준비 (없으면 사용자에게 요청)
# 2) parent 설정
node dist/index.js post edit <project> <child-number> --parent <project>/<parent-number>
# 기대: '업무 수정 완료' + '상위 업무 변경 완료' 200 OK

# 3) parent 변경 (다른 부모로)
node dist/index.js post edit --id <child-postId> --parent <other-parent-postId>

# 4) Dooray 제약 케이스: 손자 구조 시도 (상위업무를 가진 하위업무를 상위로) → 400 에러 기대
# 5) dry-run JSON
node dist/index.js post edit <project> <child-number> --parent <project>/<other-parent> --dry-run --json
# 기대: { body, users, parentChange: '<project>/<other-parent>' }. API 미호출

# 6) interactive 경고
node dist/index.js post edit <project> <child-number> --parent <project>/<parent-number>   # --title/--body 없음
# 기대: stderr 경고 + frontmatter 편집 후 parent 미적용
```

## 성공 기준

```bash
# cwd: /Users/nhn/personal/dooray-cli

# 1. tsc + build + test
pnpm tsc --noEmit 2>&1 | grep -cE "^src/"
# 기대: 0
pnpm build && pnpm test
# 기대: exit 0

# 2. 옵션 추가
grep -nE "^\s*\.option\(\"--parent <ref>\"" src/commands/post/edit.ts
# 기대: 1줄

# 3. setPostParent 호출
grep -nE "client\.setPostParent\(" src/commands/post/edit.ts
# 기대: 1줄

# 4. resolvePostRef 호출
grep -cE "resolvePostRef" src/commands/post/edit.ts
# 기대: 1 이상

# 5. interactive 경고
grep -nE "--parent 는 --title/--body" src/commands/post/edit.ts
# 기대: 1줄

# 6. dry-run JSON 에 parentChange
grep -nE "parentChange" src/commands/post/edit.ts
# 기대: 1줄

# 7. (실증 통과 시) executor 메모: parent 설정 / 변경 / dry-run 각 1회 성공
```

## 작업 외 금지

- `--parent-clear` 옵션 추가 금지 — cmux-browser spike 결과 API 미지원 확인됨 (CLAUDE.md 주의사항 명시)
- `client.setPostParent` 본체 변경 금지 — 이미 존재 + 안정 구현
- `client.updatePost` payload 에 parentPostId 넣기 금지 — UpdatePostRequest type 에 미존재 (api/types.ts:242)
- ADR / planning docs 변경 금지 (planning 단계 commit `a055fa5` 으로 반영됨)
- README / SKILL.md 갱신 금지 — phase-02
- mention / link-task / cc 처리 흐름 변경 금지 (인접 패턴 답습)

## 커밋

```bash
# cwd: /Users/nhn/personal/dooray-cli
# branch: feat/030-feat-post-edit-parent
git add src/commands/post/edit.ts
git commit -m "feat(commands): add --parent option to post edit

Issue #60 (phase 1/2): 상위 업무 설정/변경. client.setPostParent (이미
존재, POST .../set-parent-post endpoint) 호출 — updatePost full payload
와 별도 endpoint 라 sequential. cmux-browser spike 결과 unset-parent-post
부재 확인 → --parent-clear 제외. interactive (\$EDITOR) 모드 경고 +
무시 (mention/cc 답습). dry-run JSON 에 parentChange 표시.

API 실증: 사용자 환경에서 parent 설정·변경·dry-run 1 cycle 200 OK."
```
