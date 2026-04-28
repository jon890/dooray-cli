# Phase 2: project groups/tags 명령 + formatter + index.ts 등록 + README/SKILL.md 갱신

## 컨텍스트

Phase 1의 데이터 레이어 위에 사용자 인터페이스. ADR 자명성 통과 — 별도 ADR 없이 task description으로 의도 보존.

### 먼저 읽을 파일

- `src/commands/project/members.ts` — 명령 시그니처 답습
- `src/commands/project/workflows.ts` — 동일 패턴 확인
- `src/index.ts` — `projectCommand` 등록 위치
- `src/formatters/table.ts` — `output(opts, {headers, rows, raw, ids})` 시그니처
- `src/resolvers/member-group.ts`, `src/resolvers/tag.ts` (phase 1 산출)
- `README.md` "사용법" → "### 프로젝트" 섹션
- `skills/dooray-cli/SKILL.md` 명령 카탈로그

## 작업 목록 (5개)

### 1) `src/commands/project/groups.ts` 신규

`members.ts`를 거의 그대로 복제:
```ts
import { Command } from "commander";
import { getConfigOrThrow } from "../../config/store.js";
import { DoorayApiClient } from "../../api/client.js";
import { resolveProject } from "../../resolvers/project.js";
import { ensureMemberGroups } from "../../resolvers/member-group.js";
import { output, type OutputOptions } from "../../formatters/table.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";

export const projectGroupsCommand = new Command("groups")
  .description("프로젝트 멤버 그룹 목록 조회")
  .argument("<project>", "프로젝트 코드 또는 ID")
  .action(async (project: string) => {
    const globalOpts = projectGroupsCommand.optsWithGlobals() as OutputOptions;
    const config = await getConfigOrThrow();
    const client = new DoorayApiClient(config.apiKey, config.baseUrl);

    startSpinner("멤버 그룹 목록 조회 중...");
    const projectId = await resolveProject(client, project);
    const groups = await ensureMemberGroups(client, projectId);
    stopSpinner(true, "멤버 그룹 목록 조회 완료");

    output(globalOpts, {
      headers: ["ID", "Code"],
      rows: groups.map((g) => [g.id, g.code]),
      raw: groups,
      ids: groups.map((g) => g.id),
    });
  });
```

### 2) `src/commands/project/tags.ts` 신규

`groups.ts`와 동일 패턴, `ensureTags` 호출. 출력 컬럼: ID / Color / Name / Group / Mandatory

```ts
import { Command } from "commander";
import { getConfigOrThrow } from "../../config/store.js";
import { DoorayApiClient } from "../../api/client.js";
import { resolveProject } from "../../resolvers/project.js";
import { ensureTags } from "../../resolvers/tag.js";
import { output, type OutputOptions } from "../../formatters/table.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";

export const projectTagsCommand = new Command("tags")
  .description("프로젝트 태그 목록 조회")
  .argument("<project>", "프로젝트 코드 또는 ID")
  .action(async (project: string) => {
    const globalOpts = projectTagsCommand.optsWithGlobals() as OutputOptions;
    const config = await getConfigOrThrow();
    const client = new DoorayApiClient(config.apiKey, config.baseUrl);

    startSpinner("태그 목록 조회 중...");
    const projectId = await resolveProject(client, project);
    const tags = await ensureTags(client, projectId);
    stopSpinner(true, "태그 목록 조회 완료");

    output(globalOpts, {
      headers: ["ID", "Color", "Name", "Group", "Mandatory"],
      rows: tags.map((t) => [
        t.id,
        t.color,
        t.name,
        t.groupName ?? "",
        t.groupMandatory ? "Y" : "",
      ]),
      raw: tags,
      ids: tags.map((t) => t.id),
    });
  });
```

### 3) `src/index.ts` — projectCommand에 두 명령 등록

기존 `projectCommand.addCommand(projectMembersCommand)` 줄 근처에 추가:
```ts
import { projectGroupsCommand } from "./commands/project/groups.js";
import { projectTagsCommand } from "./commands/project/tags.js";
// ...
projectCommand.addCommand(projectGroupsCommand);
projectCommand.addCommand(projectTagsCommand);
```

`workflows`/`members` 다음에 둘을 자연스럽게 나열.

### 4) `src/commands/doctor.ts` — `memberGroupProjectCount` 출력 추가

phase 1에서 `getCacheStats`가 신규 필드를 반환. doctor 출력에 1줄 추가:
```
Member Group 캐시 (프로젝트 수): N
```

기존 `Member 캐시`/`Workflow 캐시`/`Tag 캐시` 라인 옆에 동일 톤으로.

### 5) `README.md` + `skills/dooray-cli/SKILL.md` 갱신

**README.md** "### 프로젝트" 섹션:
- `dooray project groups <project>` 한 줄 + 예시
- `dooray project tags <project>` 한 줄 + 예시
- 010 캐시 schema 변경 안내(컬럼 Color 추가): "이전 버전에서 캐시한 태그가 색상 없이 표시되면 `dooray cache clear` 실행"

**skills/dooray-cli/SKILL.md** 명령 카탈로그에 동일 2개 명령 추가. 다른 project 명령(`members`, `workflows`)과 동일한 형식으로.

## 성공 기준

- [ ] `pnpm run build` 성공
- [ ] `pnpm test` 통과
- [ ] `node dist/index.js project --help` 출력에 `groups`, `tags` 노출
- [ ] `node dist/index.js project groups --help` / `project tags --help` 정상
- [ ] `grep -c "ensureMemberGroups\|ensureTags" src/commands/project/{groups,tags}.ts` → 각 1
- [ ] `grep -c "projectGroupsCommand\|projectTagsCommand" src/index.ts` → 4 이상 (import + addCommand)
- [ ] `grep -c "Member Group 캐시\|memberGroupProjectCount" src/commands/doctor.ts` → 2 이상
- [ ] `grep -c "project groups\|project tags" README.md skills/dooray-cli/SKILL.md` → 각 2 이상

## 주의사항

- **`<project>` positional 필수** — `project members`/`workflows`와 일관 (이슈 본문은 `--project` 옵션 형태였으나 본 레포 컨벤션 우선)
- **`--json`/`--quiet` 처리는 `output()` 헬퍼가 자동 처리** — 별도 분기 불필요
- **이슈 본문의 Members 컬럼은 본 task에서 미구현** — `--with-members` 옵션은 후속 issue 후보
- **이슈 #20의 사용 예시(시나리오 1: 그룹 멘션 마크업)는 #21/#25 task의 input** — 본 task는 단순 lookup만 제공
- **README/SKILL.md 톤은 기존 명령 항목들과 일관** (예: 한 줄 설명 + 코드 블록 1개)

## Blocked 조건

- phase 1 산출물(`ensureMemberGroups`, `CachedMemberGroup`, `getProjectMemberGroups`, color 필드) 부재 → `PHASE_BLOCKED: phase 1 미완료`
- `output()` 헬퍼 시그니처가 다름 → 기존 `members.ts` 호출 그대로 따라할 것
