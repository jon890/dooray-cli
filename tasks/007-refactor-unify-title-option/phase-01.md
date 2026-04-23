# Phase 1: post/create + post/edit 옵션 통일 (--title 추가, --subject alias 유지)

## 컨텍스트

Issue #8: `dooray post create/edit`는 `--subject`를 쓰고, `dooray wiki page create`는 `--title`을 써서 CLI 플래그 네이밍이 일관되지 않았다. AI agent가 learnable pattern을 기대하기 어려운 상황. 공식 API 필드명은 둘 다 `subject`이지만 CLI 사용자 관점에서 `--title`이 자연스럽다는 판단으로 **`--title`을 표준화**, `--subject`는 **deprecated alias로 유지**.

### 먼저 읽을 파일

- `src/commands/post/create.ts` L57 — `.requiredOption("--subject <title>", "업무 제목")`
- `src/commands/post/edit.ts` L64 주변 — `.option("--subject <title>", "제목 변경 (non-interactive)")`
- `src/commands/wiki/page-create.ts` L42 — 이미 `--title`을 쓰는 참조 패턴
- `src/utils/errors.ts` — `DoorayCliError` 패턴
- `src/utils/exit-codes.ts` — `EXIT_PARAM_ERROR`
- `CLAUDE.md` 주의사항 섹션 — 이번 변경의 정책 문장 (이미 main에 커밋됨, `f4ad1a0`)

### 이전 커밋 상호작용

```bash
# cwd: /Users/nhn/personal/dooray-cli
git log --oneline -5
```

최근 main (작성 시점):
```
f4ad1a0 docs: unify post/wiki title option to --title for issue #8
78e8d9a docs(skill): document API limitations in dooray-cli SKILL.md
44fa9ff chore(tasks): adopt NNN-{name} naming convention
9a685cb docs(api): document wiki page update 3-endpoint split for issue #4
f700079 docs(task): add feat-wiki-page-edit-non-interactive task for issue #4
```

`f4ad1a0`에서 정책은 이미 문서화됨. 이 phase는 그 정책을 코드로 반영.

### 건드리지 않는 대상 (중요)

- `src/commands/post/list.ts` L13의 `--subject <keyword>` — 이건 **제목 키워드 필터** 용도. 의미 다름 → 변경 금지
- `src/commands/mail/send.ts` L12의 `--subject <title>` — 이메일 표준 용어 → 변경 금지
- `src/commands/wiki/page-create.ts` — 이미 `--title`을 사용 중 → 변경 불필요
- `src/commands/wiki/page-edit.ts` — Issue #4(task 006) 진행 중이므로 이 task에서 건드리지 말 것

### 설계 결정 (사용자 합의, `f4ad1a0` 커밋 참조)

1. **`requiredOption` → `option` 으로 변경** — commander가 단일 옵션만 강제할 수 있어 alias 체크를 할 수 없다. action 핸들러에서 수동 검증
2. **alias 해석**: `opts.title ?? opts.subject` — `--title` 우선
3. **deprecation 경고**: `--subject` 만 지정됐을 때 `stderr`에 한 줄 경고 출력
   - stdout에는 쓰지 않아 `--json` 파이프라인 오염 없음
   - AI agent 호환성 유지
4. **헬퍼 추출 없이 인라인** — 2 파일에 3-4줄 반복, YAGNI

## 목표

1. `src/commands/post/create.ts` — `--title` 추가, `--subject` alias 유지, 인라인 검증 + 경고
2. `src/commands/post/edit.ts` — 동일 패턴 적용
3. 빌드 통과

## 작업 목록

### 1) `src/commands/post/create.ts` 변경

**현재 (L57 근방)**:

```ts
  .requiredOption("--subject <title>", "업무 제목")
```

**변경 후**:

```ts
  .option("--title <title>", "업무 제목")
  .option("--subject <subject>", "--title의 deprecated alias")
```

**action 진입부에 검증 + 경고 블록 추가** — 기존 body 읽기 등 로직 **앞**에:

```ts
    const subject = opts.title ?? opts.subject;
    if (!subject) {
      throw new DoorayCliError(
        "--title이 필요합니다.",
        EXIT_PARAM_ERROR,
      );
    }
    if (opts.subject && !opts.title) {
      process.stderr.write(
        "⚠  --subject는 deprecated입니다. 대신 --title을 사용해주세요.\n",
      );
    }
```

**기존 action 내부의 `opts.subject` 참조는 `subject` 로컬 변수로 교체**. 모든 사용 지점 grep으로 찾아 `opts.subject` → `subject` 변경.

**import 확인**: 이미 `DoorayCliError`, `EXIT_PARAM_ERROR` 가 import 되어있는지. 없으면 추가:

```ts
import { DoorayCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
```

### 2) `src/commands/post/edit.ts` 변경

**현재 (L64 근방)**:

```ts
  .option("--subject <title>", "제목 변경 (non-interactive)")
```

**변경 후**:

```ts
  .option("--title <title>", "제목 변경 (non-interactive)")
  .option("--subject <subject>", "--title의 deprecated alias")
```

**action 내부에서 제목을 쓰는 지점에 유사 패턴 적용** — 단, edit의 `--title`은 **optional** 이므로 "필요" 에러 없이 단순 fallback만:

```ts
    const title = opts.title ?? opts.subject;
    if (opts.subject && !opts.title) {
      process.stderr.write(
        "⚠  --subject는 deprecated입니다. 대신 --title을 사용해주세요.\n",
      );
    }
    // 이후 title 변수를 사용 (기존 opts.subject 자리에)
```

**기존 `opts.subject` 참조는 `title` 로컬 변수로 교체**.

### 3) 빌드 검증

```bash
# cwd: /Users/nhn/personal/dooray-cli
pnpm run build
```

### 4) 정적 검증

```bash
# cwd: /Users/nhn/personal/dooray-cli

# post/create: --title 옵션 추가 확인
grep -n 'option("--title' src/commands/post/create.ts

# post/create: --subject가 alias로 남아있는지
grep -n 'option("--subject' src/commands/post/create.ts

# post/create: requiredOption 제거 확인
grep -n 'requiredOption' src/commands/post/create.ts || echo "OK_REQUIRED_REMOVED"

# post/edit: --title 옵션 추가 확인
grep -n 'option("--title' src/commands/post/edit.ts

# post/edit: --subject alias 확인
grep -n 'option("--subject' src/commands/post/edit.ts

# deprecation 경고 메시지 번들 포함
grep -c "deprecated입니다" dist/index.js

# post/list 와 mail/send의 --subject는 건드리지 않았는지 확인 (회귀 방지)
grep -n 'option("--subject' src/commands/post/list.ts src/commands/mail/send.ts
```

## 성공 기준

- [ ] `pnpm run build` 성공 (exit 0)
- [ ] `grep 'option("--title' src/commands/post/create.ts` → 1줄 이상
- [ ] `grep 'option("--subject' src/commands/post/create.ts` → 1줄 (alias)
- [ ] `grep 'requiredOption' src/commands/post/create.ts` → 매치 없음 (requiredOption 자체가 제거되어야 함)
- [ ] `grep 'option("--title' src/commands/post/edit.ts` → 1줄
- [ ] `grep 'option("--subject' src/commands/post/edit.ts` → 1줄 (alias)
- [ ] `grep -c "deprecated입니다" dist/index.js` → 2 이상 (create + edit 두 경고 메시지)
- [ ] `grep 'option("--subject <keyword>"' src/commands/post/list.ts` → 1줄 (변경 금지 대상 보존)
- [ ] `grep 'option("--subject' src/commands/mail/send.ts` → 1줄 (변경 금지 대상 보존)
- [ ] `git diff --stat src/commands/post/` → 2 파일 수정 (create.ts + edit.ts)

## 주의사항

- **`post/list --subject` 절대 건드리지 말 것** — 의미 다름(필터 키워드)
- **`mail/send --subject` 절대 건드리지 말 것** — 이메일 표준 용어
- **`wiki/page-create` / `wiki/page-edit`** 는 Issue #4/기존 코드 범위 → 이 phase에서 수정 금지
- **deprecation 경고는 stderr로만** — stdout에 쓰면 `--json` 파이프라인이 오염됨
- **기존 `opts.subject` 내부 참조**를 `subject`/`title` 로컬 변수로 전부 교체. 빠뜨리면 deprecation 경고가 뜨는데 실제 값은 여전히 `opts.subject`를 참조해 혼란
- **상수 메시지 문자열 통일**: create/edit 모두 `"⚠  --subject는 deprecated입니다. 대신 --title을 사용해주세요.\n"` 동일 텍스트 사용 (grep count가 2 이상이 되도록)

## Blocked 조건

- `src/commands/post/create.ts` L57 주변에서 `requiredOption("--subject ...")` 블록을 못 찾음 → `PHASE_BLOCKED: post/create.ts 구조 변경 감지`
- `src/commands/post/edit.ts` L64 주변에서 `option("--subject ...")` 블록을 못 찾음 → `PHASE_BLOCKED: post/edit.ts 구조 변경 감지`
- 빌드 실패가 변경과 무관한 기존 에러 → `PHASE_BLOCKED: 사전 존재한 빌드 에러`
