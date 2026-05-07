# Phase 02 — `post edit` / `post comment edit` 에 attachment guard 통합

## 컨텍스트

phase-01 의 `findDroppedAttachments` 를 두 명령에 적용. 새 본문에 빠진 attachment 가 있으면 stderr 경고 + (y/N) confirm. non-TTY 환경에서는 `--no-confirm` 플래그 없으면 abort.

코드 현황:
- `src/commands/post/edit.ts:42-117` — interactive ($EDITOR) + non-interactive (--title/--body) 양 모드. `client.getPost` 로 기존 post 획득 후 `client.updatePost` 로 full replace
- `src/commands/post/comment/edit.ts:80-94` — `client.getPostComments` 로 기존 댓글 획득 후 `client.updatePostComment` 로 full replace
- 두 명령 모두 `--body` / `--body-file` (- = stdin) 와 $EDITOR 모드 보유

## 변경 파일 (정확)

```bash
# cwd: /Users/nhn/personal/dooray-cli
git diff <base>..HEAD --name-only -- src/commands/post/edit.ts src/commands/post/comment/edit.ts
```

기대 결과 (총 2 파일):
```
src/commands/post/comment/edit.ts
src/commands/post/edit.ts
```

## 작업 항목

### 1. 공통 가드 호출 패턴

각 명령의 `client.updatePost(...)` / `client.updatePostComment(...)` 호출 **직전**에 dropped 검사.

```ts
import { findDroppedAttachments } from "../../utils/attachment-check.js";

// ... 새 본문 (newBody) 결정 후, update 호출 전:
const oldBody = post.body.content; // 또는 comment.body.content
const attachments = (post.files ?? []).map((f) => ({ id: f.id, name: f.name }));
const dropped = findDroppedAttachments(oldBody, newBody, attachments);

if (dropped.length > 0) {
  await guardDroppedAttachments(dropped, opts.noConfirm ?? false);
}
```

### 2. `guardDroppedAttachments` 헬퍼 — 같은 파일 내 또는 별도 util

dropped 가 비어있지 않을 때의 처리:

- stderr 에 경고 출력 (각 dropped 의 `id` + `name`)
- TTY 면: 표준 prompt (`y/N`). `n` 또는 enter → abort (exit 1)
- non-TTY (예: pipe 환경) 면: `--no-confirm` 없으면 abort. 있으면 경고만 남기고 통과

구현 위치: 명령 파일 양쪽에서 공통이라 `src/utils/attachment-check.ts` 에 함께 둠.

```ts
import readline from "node:readline";
import { DoorayCliError } from "./errors.js";
import { EXIT_PARAM_ERROR } from "./exit-codes.js";

export async function guardDroppedAttachments(
  dropped: DroppedAttachment[],
  noConfirm: boolean,
): Promise<void> {
  process.stderr.write(`⚠  새 본문에서 ${dropped.length}개 attachment reference 가 빠집니다:\n`);
  for (const a of dropped) {
    const label = a.name ? `${a.name} (id=${a.id})` : `id=${a.id}`;
    process.stderr.write(`   - /files/${a.id}  ${a.name ? "← " + a.name : ""}\n`);
  }
  process.stderr.write(`   (attachment 자체는 서버에 남지만 본문에서 사라져 보입니다.)\n`);

  if (noConfirm) {
    process.stderr.write(`   --no-confirm 플래그로 그대로 진행합니다.\n`);
    return;
  }

  const isTty = process.stdin.isTTY;
  if (!isTty) {
    throw new DoorayCliError(
      "non-TTY 환경에서 누락 attachment 가 감지되었습니다. 의도한 변경이면 --no-confirm 플래그로 다시 실행하세요.",
      EXIT_PARAM_ERROR,
    );
  }

  // TTY 인터랙티브 confirm (default = N)
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  const answer = await new Promise<string>((resolve) => {
    rl.question("계속 진행하시겠습니까? (y/N) ", resolve);
  });
  rl.close();
  if (!/^y(es)?$/i.test(answer.trim())) {
    throw new DoorayCliError("취소되었습니다.", EXIT_PARAM_ERROR);
  }
}
```

### 3. `src/commands/post/edit.ts` — 두 모드 모두 가드

`postEditCommand`:

- option 추가: `.option("--no-confirm", "누락 attachment 경고 시 confirm 없이 진행 (자동화용)")`
- non-interactive 분기: `newBody` 결정 후 `client.updatePost` 직전에 `findDroppedAttachments` + `guardDroppedAttachments` 호출. `newBody` 가 null 이면 (옵션 안 줌) skip
- interactive 분기 ($EDITOR): `parsed.body` 가 newBody. 동일 호출

post 의 `attachments` 는 `post.files` 사용.

### 4. `src/commands/post/comment/edit.ts` — 동일 패턴

- option `.option("--no-confirm", "...")` 추가
- `commentUpdate` 직전에 `findDroppedAttachments` 호출. `comment.files ?? []` 사용
- comment edit 은 mention 옵션과 함께 본문이 합성되는 흐름이라 합성 후 최종 본문 기준 비교

### 5. 동작 실증

실증 시나리오 (executor 가 실행):

```bash
# cwd: /Users/nhn/personal/dooray-cli
pnpm build

# 1) attachment 가 본문에 있는 댓글 만들기
COMMENT_ID=$(node dist/index.js post comment add <project> <post-number> --body "before ![](/files/<existing-fileId>)" --json | jq -r '.id')

# 2) 새 본문에 attachment reference 빠뜨리기 (non-TTY = 파이프) → abort 기대
echo "without ref" | node dist/index.js post comment edit <project> <post-number> $COMMENT_ID --body -
# 기대: stderr 경고 + exit 1

# 3) --no-confirm 으로 강제 진행
echo "without ref" | node dist/index.js post comment edit <project> <post-number> $COMMENT_ID --body - --no-confirm
# 기대: stderr 경고 + exit 0

# 4) 정리
node dist/index.js post comment delete <project> <post-number> $COMMENT_ID
```

## 성공 기준

```bash
# cwd: /Users/nhn/personal/dooray-cli

# 1. 빌드 + 테스트 통과
pnpm build && pnpm test
# 기대: exit 0

# 2. --no-confirm 옵션 추가
grep -nE "no-confirm" src/commands/post/edit.ts src/commands/post/comment/edit.ts
# 기대: 4줄 (2 파일 × option 정의 + 사용)

# 3. findDroppedAttachments 호출 양쪽
grep -cE "findDroppedAttachments" src/commands/post/edit.ts src/commands/post/comment/edit.ts
# 기대: 각 1 이상

# 4. guardDroppedAttachments export
grep -nE "export async function guardDroppedAttachments" src/utils/attachment-check.ts
# 기대: 1줄

# 5. (실증 통과 시) executor 메모: pipe + abort + --no-confirm 시나리오 통과
```

## 작업 외 금지

- post create 시 attachment 검사 추가 금지 (create 는 새 post — 비교 대상 없음)
- `--preserve-attachments` 자동 append 옵션 추가 금지 (이번 phase scope 외 — 옵션 B)
- diff 출력 (옵션 C) 추가 금지
- attachment 자체를 서버에서 제거하는 cleanup 추가 금지
- ADR 추가 금지 (자명성 게이트 — 일반적 confirm UX 패턴)

## 커밋

```bash
# cwd: /Users/nhn/personal/dooray-cli
# branch: feat/021-feat-edit-attachment-guard
git add src/utils/attachment-check.ts src/commands/post/edit.ts src/commands/post/comment/edit.ts
git commit -m "feat(commands): warn + confirm on dropped attachments in edit

Issue #35 item 2: full-replace edit silently broke inline image refs.
Detect /files/<id> diff between old and new body; stderr warn + (y/N)
confirm in TTY, abort in non-TTY unless --no-confirm. Applied to both
post edit and post comment edit."
```
