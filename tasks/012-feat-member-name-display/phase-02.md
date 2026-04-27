# Phase 2: member 명령 신설 (get/list) + formatter

## 컨텍스트

`dooray member get/list` 서브커맨드 추가. ADR-021. phase 1 헬퍼 활용.

### 먼저 읽을 파일

- `src/index.ts` — Commander 등록 위치
- `src/commands/post/list.ts`, `src/commands/cache.ts` 등 — 명령 등록 패턴
- `src/formatters/table.ts` — `output(opts, {headers, rows, raw, ids})`, `printJson` 시그니처
- `src/api/client.ts` `getMemberDetail`, `getProjectMembers`
- `src/resolvers/project.ts` — `resolveProject` 시그니처
- `src/resolvers/member.ts` — phase 1 산출 (`lookupMemberName`)
- `src/api/types.ts` — `MemberDetail`(347:), `ProjectMember`(342:), `MemberDetailResponse`(356:), `ProjectMemberListResponse`(358:)

## 작업 목록 (4개)

### 1) `src/formatters/member.ts` — 신규

```ts
import type { MemberDetail } from "../api/types.js";
import type { OutputOptions } from "./table.js";
import { output, printJson } from "./table.js";

export function formatMemberDetail(member: MemberDetail, opts: OutputOptions): void {
  if (opts.json) { printJson(member); return; }
  if (opts.quiet) { process.stdout.write(member.id + "\n"); return; }
  const lines = [
    `이름: ${member.name}`,
    ...(member.englishName ? [`영문명: ${member.englishName}`] : []),
    ...(member.nickname ? [`별명: ${member.nickname}`] : []),
    ...(member.userCode ? [`사번/ID: ${member.userCode}`] : []),
    ...(member.externalEmailAddress ? [`외부 이메일: ${member.externalEmailAddress}`] : []),
    `member-id: ${member.id}`,
  ];
  process.stdout.write(lines.join("\n") + "\n");
}

export interface MemberListRow {
  id: string;
  name: string;
  role?: string;
}

export function formatMemberList(rows: MemberListRow[], opts: OutputOptions): void {
  output(opts, {
    headers: ["ID", "Name", "Role"],
    rows: rows.map((r) => [r.id, r.name, r.role ?? ""]),
    raw: rows,
    ids: rows.map((r) => r.id),
  });
}
```

### 2) `src/commands/member/get.ts` — 신규

```ts
import { Command } from "commander";
import { getConfigOrThrow } from "../../config/store.js";
import { DoorayApiClient } from "../../api/client.js";
import { formatMemberDetail } from "../../formatters/member.js";
import type { OutputOptions } from "../../formatters/table.js";

export const memberGetCommand = new Command("get")
  .description("멤버 상세 정보 조회 (organizationMemberId)")
  .argument("<member-id>", "조회할 organization member ID")
  .action(async (memberId) => {
    const globalOpts = memberGetCommand.optsWithGlobals() as OutputOptions;
    const config = await getConfigOrThrow();
    const client = new DoorayApiClient(config.apiKey, config.baseUrl);
    const res = await client.getMemberDetail(memberId);
    formatMemberDetail(res.result, globalOpts);
  });
```

### 3) `src/commands/member/list.ts` — 신규

```ts
import { Command } from "commander";
import { getConfigOrThrow } from "../../config/store.js";
import { DoorayApiClient } from "../../api/client.js";
import { resolveProject } from "../../resolvers/project.js";
import { ensureMembers } from "../../resolvers/member.js";
import { formatMemberList } from "../../formatters/member.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import type { OutputOptions } from "../../formatters/table.js";

export const memberListCommand = new Command("list")
  .description("프로젝트 멤버 목록")
  .argument("<project>", "프로젝트 코드 또는 ID")
  .action(async (project) => {
    const globalOpts = memberListCommand.optsWithGlobals() as OutputOptions;
    const config = await getConfigOrThrow();
    const client = new DoorayApiClient(config.apiKey, config.baseUrl);
    startSpinner("멤버 목록 조회 중...");
    const projectId = await resolveProject(client, project);
    const members = await ensureMembers(client, projectId);
    stopSpinner(true, `${members.length}명`);
    formatMemberList(
      members.map((m) => ({ id: m.organizationMemberId, name: m.name })),
      globalOpts,
    );
  });
```

> `ensureMembers`는 phase 1의 `member.ts`에서 export됨. role 정보는 현재 `CachedMember`에 없음 — formatter의 role 컬럼은 빈 값. 후속에서 cached 모델 확장 시 채울 수 있음.

### 4) `src/commands/member/index.ts` + `src/index.ts` 등록

`src/commands/member/index.ts`:
```ts
import { Command } from "commander";
import { memberGetCommand } from "./get.js";
import { memberListCommand } from "./list.js";

export const memberCommand = new Command("member")
  .description("Dooray 멤버 조회");
memberCommand.addCommand(memberGetCommand);
memberCommand.addCommand(memberListCommand);
```

`src/index.ts`에 등록 (다른 명령과 동일 패턴):
```ts
import { memberCommand } from "./commands/member/index.js";
// ...
program.addCommand(memberCommand);
```

## 성공 기준

- [ ] `pnpm build` 성공
- [ ] `node dist/index.js member --help` 출력에 `get`, `list` 노출
- [ ] `node dist/index.js member get --help` 정상
- [ ] `node dist/index.js member list --help` 정상 (`<project>` positional 노출)
- [ ] `grep -c "memberCommand\|memberGetCommand\|memberListCommand" src/commands/member/*.ts src/index.ts` → 6 이상

## 주의사항

- **`--json`/`--quiet` global option 처리는 기존 명령들과 동일 패턴** (`optsWithGlobals()`)
- **role 컬럼은 빈 값으로 두기** — `CachedMember`에 role 없음. 본 task scope 외
- **member list가 cached members 그대로 사용**: 캐시 invalidation은 별도 로직 (기존 `cache clear`로 우회 가능)
- **`spinner` import는 다른 명령과 동일 경로** — `../../utils/spinner.js`

## Blocked 조건

- phase 1 산출물(`ensureMembers`/`lookupMemberName`) 부재 → `PHASE_BLOCKED: phase 1 미완료`
- `src/index.ts` 명령 등록 패턴이 단순 `addCommand` 아닌 경우 → 기존 명령 패턴 그대로 따를 것
