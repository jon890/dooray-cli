# Phase 3: post comment 4개 명령 + --comment-id 옵션화

## 컨텍스트

`post comment` 하위 4개 명령(add/edit/delete/list)에 phase 1 헬퍼 적용. edit/delete는 `<comment-id>` sub-id를 옵션화(`--comment-id`)하여 URL/`--id` 모드와 양립. ADR-020.

### 먼저 읽을 파일

- `src/commands/post/comment/add.ts`, `edit.ts`, `delete.ts`, `list.ts`
- `src/resolvers/post-input.ts` (phase 1)

## 명령별 변경

### 1) `comment add`

`<project> <post-number>` → `[project]`, `[post-number]` + `--id`, `--url`. comment-id 없음.

```ts
.argument("[project]", "...")
.argument("[post-number]", "...")
.option("--id <postId>", "...")
.option("--url <url>", "...")
.option("--body <text>", "...")     // 기존
.option("--body-file <path>", "...")
.action(async (project, postNumber, opts) => {
  const { projectId, postId } = await resolvePostInput(client, {
    projectArg: project, postNumberArg: postNumber, idOpt: opts.id, urlOpt: opts.url,
  });
  ...
});
```

### 2) `comment list`

동일 패턴. comment-id 없음.

### 3) `comment edit` — sub-id 옵션화

기존:
```
.argument("<project>", "...")
.argument("<post-number>", "...")
.argument("<comment-id>", "댓글 ID")
```

변경:
```
.argument("[project-or-comment-id]", "프로젝트 코드, Dooray URL, 또는 (`--id`/`--url` 모드일 때) 댓글 ID")
.argument("[post-number-or-comment-id]", "업무 번호 또는 (`--id`/`--url` 모드일 때) 댓글 ID")
.argument("[comment-id]", "댓글 ID (positional 모드)")
.option("--id <postId>", "...")
.option("--url <url>", "...")
.option("--comment-id <commentId>", "댓글 ID (positional 대체)")
.option("--title <text>", ...)   // 기존 그대로
.option("--body <text>", ...)
```

> commander의 argument 이름은 help 출력에만 영향 — 위 이름은 사용자에게 모호. 단순화:

**더 깔끔한 시그니처 (권장)**:
```
.argument("[arg1]", "프로젝트 코드 / Dooray URL / 댓글 ID (모드별)")
.argument("[arg2]", "업무 번호 또는 댓글 ID (모드별)")
.argument("[arg3]", "댓글 ID (positional 3개 모드)")
.option("--id <postId>", "...")
.option("--url <url>", "...")
.option("--comment-id <commentId>", "...")
```

action에서 commentId 추출 로직:
```ts
.action(async (arg1, arg2, arg3, opts) => {
  let projectArg: string | undefined;
  let postNumberArg: string | undefined;
  let commentId: string | undefined = opts.commentId;

  if (opts.id || opts.url) {
    // 옵션 모드: arg1만 사용 (= comment-id), arg2/arg3은 정상 입력이면 비어야 함
    if (arg2 || arg3) {
      throw new DoorayCliError(
        "--id/--url 모드에서는 댓글 ID 외 추가 positional 인자를 받지 않습니다. --comment-id 옵션 사용을 권장합니다.",
        EXIT_PARAM_ERROR,
      );
    }
    commentId = commentId ?? arg1;
  } else if (arg3) {
    // positional 3개 모드 (legacy 호환): project + post-number + comment-id
    projectArg = arg1;
    postNumberArg = arg2;
    commentId = commentId ?? arg3;
  } else if (arg1 && !arg2) {
    // positional 1개 — URL 모드
    projectArg = arg1; // resolvePostInput이 URL 분기 처리
    commentId = commentId ?? "";
    if (!commentId) {
      throw new DoorayCliError(
        "URL/--id 모드에서는 --comment-id 옵션이 필요합니다.",
        EXIT_PARAM_ERROR,
      );
    }
  } else {
    // positional 2개 — project + post-number, comment-id는 옵션 필수
    projectArg = arg1;
    postNumberArg = arg2;
    if (!commentId) {
      throw new DoorayCliError(
        "<comment-id>가 필요합니다. positional 3번째 또는 --comment-id 옵션을 사용하세요.",
        EXIT_PARAM_ERROR,
      );
    }
  }

  if (!commentId) {
    throw new DoorayCliError(
      "<comment-id>가 필요합니다.",
      EXIT_PARAM_ERROR,
    );
  }

  const { projectId, postId } = await resolvePostInput(client, {
    projectArg, postNumberArg, idOpt: opts.id, urlOpt: opts.url,
  });
  // 이후 client.updatePostComment(projectId, postId, commentId, ...) 등 기존 호출
});
```

### 4) `comment delete` — sub-id 옵션화

`comment edit`와 동일 패턴 (3-인자 + `--comment-id` 옵션). action 끝부분만 `client.deletePostComment` 호출.

## 작업 목록 (4개)

각 파일에 위 변경 그대로 적용:

1) `src/commands/post/comment/add.ts` — `--id`/`--url` 추가
2) `src/commands/post/comment/list.ts` — `--id`/`--url` 추가
3) `src/commands/post/comment/edit.ts` — `--id`/`--url`/`--comment-id` 추가, 3-arg 분기 로직
4) `src/commands/post/comment/delete.ts` — `--id`/`--url`/`--comment-id` 추가, 3-arg 분기 로직

## 성공 기준

- [ ] `pnpm build` 성공
- [ ] `pnpm test` 통과
- [ ] 4개 명령 `--help`에 `--id`, `--url` 노출. edit/delete는 `--comment-id`도 노출
- [ ] `grep -c "resolvePostInput" src/commands/post/comment/*.ts` → 4
- [ ] 기존 호출 호환:
  - `dooray post comment add <project> 337 --body "..."` 동작
  - `dooray post comment edit <project> 337 cmt-abc --body "..."` 동작 (수동, phase 5)
- [ ] 신규 호출:
  - `dooray post comment edit --id 12345 --comment-id cmt-abc --body "..."` 동작 (phase 5)

## 주의사항

- **commander argument 개수 변경**: edit/delete는 `<...>` 3개 → `[...]` 3개. positional 누락 케이스를 action에서 처리
- **에러 메시지 명확성**: 사용자가 어느 모드를 의도했는지 모를 때 안내 (위 의사 코드의 throw 메시지)
- **`--comment-id` 옵션은 일관 표기** — kebab-case (commander default option-key는 camelCase로 들어옴: `opts.commentId`)
- **list 명령은 sub-id 없음** — 단순 패턴

## Blocked 조건

- phase 1·2 산출물 부재 → `PHASE_BLOCKED: 의존 phase 미완료`
- 3-arg 분기 로직이 사용자 케이스 전체를 커버하지 못하면 → `PHASE_BLOCKED: 시그니처 재설계 필요`
