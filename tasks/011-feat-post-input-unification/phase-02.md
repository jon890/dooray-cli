# Phase 2: post get/edit/done/workflow 통합 적용

## 컨텍스트

Phase 1의 `resolvePostInput` 헬퍼를 4개 명령에 적용. 기존 `<project> <post-number>` 사용자 호환 유지하면서 `--id`/`--url`/URL positional 추가.

### 먼저 읽을 파일

- `src/resolvers/post-input.ts` (phase 1 산출) — 호출 시그니처
- `src/commands/post/get.ts`, `edit.ts`, `done.ts`, `workflow.ts` — 수정 대상 4개
- `docs/adr.md` ADR-020 — 분기 규칙

## 공통 변경 패턴 (모든 4개 명령)

### Before
```ts
.argument("<project>", "프로젝트 코드 또는 ID")
.argument("<post-number>", "업무 번호")
.action(async (project, postNumber, opts) => {
  ...
  const projectId = await resolveProject(client, project);
  const postId = await resolvePost(client, projectId, Number(postNumber));
  ...
});
```

### After
```ts
.argument("[project]", "프로젝트 코드 (또는 첫 인자에 Dooray URL)")
.argument("[post-number]", "업무 번호 (project와 함께 사용)")
.option("--id <postId>", "Dooray post ID (project/post-number 대신)")
.option("--url <url>", "Dooray 업무 URL (project/post-number 대신)")
.action(async (project, postNumber, opts) => {
  ...
  const { projectId, postId } = await resolvePostInput(client, {
    projectArg: project,
    postNumberArg: postNumber,
    idOpt: opts.id,
    urlOpt: opts.url,
  });
  ...
});
```

`resolveProject` / `resolvePost` 호출은 **삭제** (resolvePostInput이 내부 처리).

## 작업 목록 (4개)

각 파일에 위 패턴 그대로 적용. 다른 옵션(`--body`, `--workflow`, `--json` 등)은 변경 금지.

### 1) `src/commands/post/get.ts`

- `.argument("<project>"...)` → `.argument("[project]"...)`
- `.argument("<post-number>"...)` → `.argument("[post-number]"...)`
- `--id`, `--url` 옵션 추가
- action에서 `resolvePostInput` 호출
- 기존 `client.getPost(projectId, postId)` 호출 그대로 유지

### 2) `src/commands/post/edit.ts`

동일 패턴. 다른 옵션(`--title`, `--body`, `--body-file`, `--subject`)은 무변경.

### 3) `src/commands/post/done.ts`

동일 패턴. action 본문의 `setPostDone` 호출 유지.

### 4) `src/commands/post/workflow.ts`

기존:
```
.argument("<project>", "...")
.argument("<post-number>", "...")
.argument("<workflow>", "...")
```

변경:
```
.argument("[project]", "...")
.argument("[post-number]", "...")
.argument("[workflow]", "워크플로우 이름 또는 클래스 (또는 --workflow 사용)")
.option("--id <postId>", ...)
.option("--url <url>", ...)
.option("--workflow <name>", "워크플로우 이름 (positional 대체)")
```

action에서 분기:
- positional 형식 (`<project> <post-number> <workflow>`)이면 `project`/`postNumber`/`workflow` 모두 채워짐
- `--id`/`--url` 모드면 첫 인자 1개 = workflow가 될 수도 있고, 첫 인자 없이 `--workflow` 옵션 사용도 가능

→ workflow 인자 해석 규칙:
1. `opts.workflow` 옵션 존재 → 우선 사용
2. positional 3개 (project + post-number + workflow) → 세 번째가 workflow
3. positional 1개 + `--id`/`--url` → 그 positional이 workflow (URL인 경우 예외 — workflow 옵션 필수)
4. 그 외 → 명시적 안내 에러

action 의사 코드:
```ts
.action(async (project, postNumber, workflowArg, opts) => {
  // workflow 인자 결정
  let workflowInput: string | undefined = opts.workflow;
  let projectArg = project;
  let postNumberArg = postNumber;
  if (!workflowInput) {
    if (workflowArg) {
      workflowInput = workflowArg; // positional 3개 모드
    } else if (opts.id || opts.url) {
      // --id/--url 모드일 땐 project 슬롯이 workflow로 해석되었을 수 있음
      // 하지만 이 케이스는 양립 불가 → resolvePostInput에 그대로 넘겨 에러 처리
    }
  }
  // 단, --id/--url 모드 + positional이 한 개만 와서 그게 workflow인 경우:
  if ((opts.id || opts.url) && projectArg && !postNumberArg && !workflowArg) {
    // projectArg를 workflow로 재해석
    workflowInput = workflowInput ?? projectArg;
    projectArg = undefined;
  }
  if (!workflowInput) {
    throw new DoorayCliError("workflow가 필요합니다. positional 또는 --workflow로 입력하세요.", EXIT_PARAM_ERROR);
  }
  const { projectId, postId } = await resolvePostInput(client, {
    projectArg, postNumberArg, idOpt: opts.id, urlOpt: opts.url,
  });
  const workflowId = await resolveWorkflow(client, projectId, workflowInput);
  await client.setPostWorkflow(projectId, postId, workflowId);
  ...
});
```

복잡도 ↑ — 정확한 규칙은 phase 5 시나리오로 검증.

## 성공 기준

- [ ] `pnpm build` 성공
- [ ] `pnpm test` 통과 (phase 1 테스트)
- [ ] 4개 명령 `--help`에 `--id`, `--url` 옵션 노출
- [ ] `grep -c "resolvePostInput" src/commands/post/{get,edit,done,workflow}.ts` → 4
- [ ] `grep -c "resolveProject\|resolvePost\b" src/commands/post/{get,edit,done}.ts` → 0 (삭제됨, workflow.ts는 별개로 검토)
- [ ] 기존 호출 (`dooray post get tc-ocr 337`) 동작 (수동 검증은 phase 5)

## 주의사항

- **post.ts의 list/search/create는 변경 금지** — 본 task 적용 외
- **다른 옵션(`--body`, `--json` 등) 변경 금지**
- **commander positional optional 변경**: `<>` → `[]` 표기. 누락 시 commander가 자동 에러 안 던지므로 resolvePostInput이 처리
- **post workflow는 인자 해석이 복잡** — positional 3개 vs 옵션 모드. 작업 4) 코드를 정확히 따를 것
- **phase 1 mock 테스트는 그대로 유지** — 본 phase에서 추가 테스트 작성 불필요 (통합 검증은 phase 5)

## Blocked 조건

- phase 1 산출물(`resolvePostInput`, `getPostStandalone`) 부재 → `PHASE_BLOCKED: phase 1 미완료`
- post workflow의 인자 해석이 commander 한계로 깔끔히 안 되는 경우 → `PHASE_BLOCKED: workflow 시그니처 재설계 필요`
