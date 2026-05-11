# Phase 02 — `project templates` 명령 + `post create --template` 통합 + 실증

## 컨텍스트

phase-01 의 client / cache / resolver 를 사용해 CLI 노출. ADR-027 정책 적용:
- 신규 명령 `dooray project templates <project>` — 사용 가능한 templateName/id 목록 (table/JSON/quiet)
- 신규 옵션 `dooray post create <project> --template <name|id>` — body/users/tags 자동 채움 + 사용자 옵션 override

코드 현황 — 패턴 답습:
- `src/commands/project/tags.ts` — `dooray project tags` 명령 패턴 (template 도 동일 시그니처)
- `src/commands/post/create.ts:42-77` — 옵션 정의 + action 흐름
- `src/index.ts` — projectCommand / postCommand 등록 위치

## 변경 파일 (정확)

```bash
# cwd: /Users/nhn/personal/dooray-cli
git diff <base>..HEAD --name-only -- src/commands/ src/index.ts
```

기대 결과 (총 3 파일):
```
src/commands/project/templates.ts        (신규)
src/commands/post/create.ts              (수정 — --template 옵션 + override 흐름)
src/index.ts                             (수정 — projectTemplatesCommand 등록)
```

## 작업 항목

### 1. `src/commands/project/templates.ts` — 신규 명령

`tags.ts` 패턴 그대로 답습. body 미포함이라 컬럼은 id / templateName 2개:

```ts
import { Command } from "commander";
import { getConfigOrThrow } from "../../config/store.js";
import { DoorayApiClient } from "../../api/client.js";
import { resolveProject } from "../../resolvers/project.js";
import { ensureTemplates } from "../../resolvers/template.js";
import { output, type OutputOptions } from "../../formatters/table.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";

export const projectTemplatesCommand = new Command("templates")
  .description("프로젝트 템플릿 목록 조회")
  .argument("<project>", "프로젝트 코드 또는 ID")
  .action(async (project: string) => {
    const globalOpts = projectTemplatesCommand.optsWithGlobals() as OutputOptions;
    const config = await getConfigOrThrow();
    const client = new DoorayApiClient(config.apiKey, config.baseUrl);

    startSpinner("템플릿 목록 조회 중...");
    try {
      const projectId = await resolveProject(client, project);
      const templates = await ensureTemplates(client, projectId);
      stopSpinner(true, "템플릿 목록 조회 완료");

      output(globalOpts, {
        headers: ["ID", "Template Name"],
        rows: templates.map((t) => [t.id, t.templateName]),
        raw: templates,
        ids: templates.map((t) => t.id),
      });
    } catch (e) {
      stopSpinner(false);
      throw e;
    }
  });
```

**code-review-pitfalls 1-2 회피**: try/catch 로 spinner leak 방지. spinner 시작 후 `resolveProject` / `ensureTemplates` 호출이라 1-1 (validation 전 spinner) 무관.

### 2. `src/index.ts` — Commander 트리 등록

기존 `projectCommand.addCommand(projectTagsCommand)` 옆에 추가:

```ts
import { projectTemplatesCommand } from "./commands/project/templates.js";
// ...
projectCommand.addCommand(projectTemplatesCommand);
```

### 3. `src/commands/post/create.ts` — `--template` 옵션 + override 흐름

#### 3.1 옵션 정의 (line ~55, `--workflow` 옆에 추가)

```ts
.option("--template <ref>", "템플릿 이름 또는 ID — body/users/tags 자동 채움 (사용자 옵션 우선 override, ADR-027)")
```

#### 3.2 action 안에서 처리

`opts.template` 가 있으면 **resolveProject 직후** 템플릿 fetch + 사용자 옵션 override merge. 위치는 subject/body 결정 흐름 (mention/link-task append) **이전**:

```ts
import { resolveTemplate } from "../../resolvers/template.js";

// resolveProject 이후, 본문/태그 결정 흐름 이전:
let templateDetail: TemplateDetail | null = null;
if (opts.template) {
  startSpinner("템플릿 조회 중...");
  try {
    const templateId = await resolveTemplate(client, projectId, opts.template);
    const res = await client.getProjectTemplateDetail(projectId, templateId, true);  // interpolation=true (ADR-027)
    templateDetail = res.result;
    stopSpinner(true, "템플릿 조회 완료");
  } catch (e) {
    stopSpinner(false);
    throw e;
  }
}
```

#### 3.3 사용자 옵션 override 정책 (ADR-027)

각 필드별로 `사용자 옵션 ?? 템플릿 값` 우선순위:

```ts
// subject: 사용자 --title 우선
const subject = opts.title ?? opts.subject ?? templateDetail?.subject;
if (!subject) throw new DoorayCliError("--title 또는 --template 둘 중 하나 필요", EXIT_PARAM_ERROR);

// body: 사용자 --body / --body-file 우선
let bodyContent = await readBodyInputOrNull(opts);  // 기존 helper
if (bodyContent == null && templateDetail?.body) bodyContent = templateDetail.body.content;
if (bodyContent == null) bodyContent = "";  // 빈 본문 허용

// tags: 사용자 --tag 우선 (override). 사용자 명시 입력 0건 + 템플릿 tags 있으면 템플릿 tags 사용
const tagInputs = (opts.tag ?? []).filter((s: string) => s.length > 0);
const effectiveTags = tagInputs.length > 0 ? tagInputs : (templateDetail?.tags?.map(t => t.name) ?? []);

// users (to/cc): 사용자 --to/--cc 우선
const toUsers = opts.to ? await resolveUsers(client, projectId, opts.to) : (templateDetail?.users?.to.map(u => ({...})) ?? []);
const ccUsers = opts.cc ? await resolveUsers(client, projectId, opts.cc) : (templateDetail?.users?.cc.map(u => ({...})) ?? []);
```

**중요**: 템플릿의 `users` 응답이 PostUsers (member/emailUser/group 분기) 형식 그대로면 CreatePostUser 로 type-cast 후 그대로 payload 에 사용 가능. executor 가 실증 1회로 형식 확인 후 처리. 형식 다르면 변환 헬퍼 추가.

#### 3.4 dry-run JSON 출력 확장

```ts
if (opts.dryRun) {
  // ... 기존 dryRun 출력에 templateUsed 표시
  if (globalOpts.json) {
    process.stdout.write(JSON.stringify({
      body: bodyContent,
      users: { to: toUsers, cc: ccUsers },
      ...(opts.template && { templateUsed: opts.template }),
    }) + "\n");
  }
  return;
}
```

### 4. 동작 실증 (사용자 환경 1회)

```bash
# cwd: /Users/nhn/personal/dooray-cli
pnpm build

# 1) 템플릿 목록
node dist/index.js project templates <project>
# 기대: id / templateName 2 컬럼 출력

# 2) 템플릿으로 업무 생성 (override 없음 — 모든 필드 템플릿)
node dist/index.js post create <project> --template "<template-name>"
# 기대: 200 OK + 템플릿 body/users/tags 그대로 인스턴스

# 3) override — title 만 사용자 지정
node dist/index.js post create <project> --template "<template-name>" --title "사용자 지정 제목"

# 4) dry-run JSON
node dist/index.js post create <project> --template "<template-name>" --dry-run --json
# 기대: { body, users, templateUsed: "..." } 출력 + API 미호출

# 5) 19자리 id 직접
TEMPLATE_ID=$(node dist/index.js project templates <project> --json | jq -r '.[0].id')
node dist/index.js post create <project> --template "$TEMPLATE_ID" --title "by id" --dry-run
```

executor 메모: 사용자 환경에 template 이 정의되어 있어야 실증 가능. 미정의 시 사용자에게 templateName 1개 요청 (또는 웹 UI 에서 임시 템플릿 생성).

## code-review-pitfalls 회피 항목

- **1-1 (validation 전 spinner)**: `project templates` 명령은 spinner 후 `resolveProject` 호출 — `tags.ts` 와 동일 순서. CLI3 (project tags 패턴 동일)
- **1-2 (spinner leak)**: 두 spinner 모두 try/catch + catch 에서 `stopSpinner(false)` + re-throw
- **2-2 / 2-3 (catch 분기 + mock mirror)**: 본 phase 는 명시적 catch 분기 없음 (단순 throw e). mock 단위 테스트는 phase-01 의 resolveTemplate 만 — 본 phase 는 실증 시나리오로 갈음

## 성공 기준

```bash
# cwd: /Users/nhn/personal/dooray-cli

# 1. tsc + build + test
pnpm tsc --noEmit 2>&1 | grep -cE "^src/"
# 기대: 0
pnpm build && pnpm test

# 2. 신규 명령 파일
ls src/commands/project/templates.ts

# 3. Commander 등록
grep -cE "projectTemplatesCommand" src/index.ts
# 기대: 2 (import + addCommand)

# 4. --template 옵션 추가
grep -nE '^\s*\.option\(\"--template <ref>\"' src/commands/post/create.ts
# 기대: 1줄

# 5. resolveTemplate 호출
grep -nE "resolveTemplate\(" src/commands/post/create.ts
# 기대: 1줄

# 6. getProjectTemplateDetail 호출 + interpolation true
grep -nE "getProjectTemplateDetail\(.*,\s*true\s*\)" src/commands/post/create.ts
# 기대: 1줄

# 7. CLI help 노출
node dist/index.js project templates --help 2>&1 | grep -cE "프로젝트 템플릿 목록"
# 기대: 1
node dist/index.js post create --help 2>&1 | grep -cE "--template"
# 기대: 1

# 8. (실증 통과 시) executor 메모: project templates + post create --template + dry-run 1 cycle 200 OK
```

## 작업 외 금지

- README / SKILL.md 갱신 금지 — phase-03
- `--field key=value` 사용자 정의 변수 추가 금지 — ADR-027 에서 명시 제외
- `--interpolation false` 옵션 추가 금지 — 본 task scope 는 기본 true 만
- `post edit --template` 추가 금지 — ADR-027 적용 범위 명시
- planning docs 변경 금지 (commit `8603e64` 으로 반영됨)
- ADR 변경 금지

## 커밋

```bash
# cwd: /Users/nhn/personal/dooray-cli
# branch: feat/031-feat-post-create-template
git add src/commands/project/templates.ts src/commands/post/create.ts src/index.ts
git commit -m "feat(commands): add project templates + post create --template (Issue #59 phase 2/3, ADR-027)

- project templates 명령 (tags 패턴 답습 + spinner try/catch)
- post create --template <name|id> 옵션 (resolveTemplate + getProjectTemplateDetail interpolation=true)
- 사용자 옵션 override 정책 (subject/body/tags/to/cc 각각 'opts ?? template' 우선순위)
- dry-run JSON 에 templateUsed 표시
- 실증: project templates 목록 + post create --template + dry-run 1 cycle 200 OK"
```
