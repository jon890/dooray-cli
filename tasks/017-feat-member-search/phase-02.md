# Phase 2: member search 명령 + formatter + 옵션 상호배타 검증

## 컨텍스트

Phase 1의 `searchMembers` API 위에 사용자 인터페이스. positional `<keyword>` = name 기본, `--email`/`--user-code` 옵션으로 다른 필드 검색.

### 먼저 읽을 파일

- `src/commands/member/get.ts`, `list.ts` (012) — 명령 등록 패턴
- `src/commands/member/index.ts` — `memberCommand.addCommand` 등록 위치
- `src/formatters/member.ts` (012) — `formatMemberList` 또는 신규 formatter 추가
- `src/api/client.ts` `searchMembers` (phase 1 산출)
- `src/utils/errors.ts`, `src/utils/exit-codes.ts`

## 작업 목록 (4개)

### 1) `src/commands/member/search.ts` 신규

```ts
import { Command } from "commander";
import { getConfigOrThrow } from "../../config/store.js";
import { DoorayApiClient } from "../../api/client.js";
import { formatMemberSearchResults } from "../../formatters/member.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { DoorayCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
import type { OutputOptions } from "../../formatters/table.js";

export const memberSearchCommand = new Command("search")
  .description("organization 전체에서 멤버 검색")
  .argument("[keyword]", "이름 검색어 (--email/--user-code 미지정 시 name으로 검색)")
  .option("--email <email>", "외부 이메일 (콤마 구분 가능, exact match)")
  .option("--user-code <code>", "사번 like 검색")
  .option("--user-code-exact <code>", "사번 exact match")
  .option("--page <n>", "페이지 (기본 0)", "0")
  .option("--size <n>", "페이지 크기 (기본 20, max 100)", "20")
  .action(async (keyword: string | undefined, opts) => {
    const globalOpts = memberSearchCommand.optsWithGlobals() as OutputOptions;

    // 옵션 검증 — 적어도 하나는 있어야 함
    const filterCount = [keyword, opts.email, opts.userCode, opts.userCodeExact].filter(Boolean).length;
    if (filterCount === 0) {
      throw new DoorayCliError(
        "검색 조건이 필요합니다. positional <keyword>(=name) 또는 --email/--user-code/--user-code-exact 중 하나 이상.",
        EXIT_PARAM_ERROR,
      );
    }
    // 보수적 상호배타: keyword(name) + 다른 필터 동시 사용 금지 (Dooray가 AND/OR 처리하는지 doc 불명확)
    if (keyword && (opts.email || opts.userCode || opts.userCodeExact)) {
      throw new DoorayCliError(
        "positional <keyword>(name)와 --email/--user-code/--user-code-exact 옵션은 동시 사용 불가.",
        EXIT_PARAM_ERROR,
      );
    }

    const config = await getConfigOrThrow();
    const client = new DoorayApiClient(config.apiKey, config.baseUrl);

    const size = Math.min(Math.max(1, Number(opts.size) || 20), 100);
    const page = Math.max(0, Number(opts.page) || 0);

    startSpinner("멤버 검색 중...");
    const res = await client.searchMembers({
      ...(keyword && { name: keyword }),
      ...(opts.email && { externalEmailAddresses: opts.email }),
      ...(opts.userCode && { userCode: opts.userCode }),
      ...(opts.userCodeExact && { userCodeExact: opts.userCodeExact }),
      page,
      size,
    });
    stopSpinner(true, `${res.totalCount}건 (이 페이지 ${res.result.length})`);

    formatMemberSearchResults(res.result, globalOpts);
  });
```

### 2) `src/formatters/member.ts` — `formatMemberSearchResults` 추가

기존 `formatMemberList`(012) 옆에 추가. 출력 컬럼: ID / Name / UserCode / Nickname / Email

```ts
import type { MemberDetail } from "../api/types.js";
// ... 기존 import 유지

export function formatMemberSearchResults(members: MemberDetail[], opts: OutputOptions): void {
  output(opts, {
    headers: ["ID", "Name", "UserCode", "Nickname", "Email"],
    rows: members.map((m) => [
      m.id,
      m.name,
      m.userCode ?? "",
      m.nickname ?? "",
      m.externalEmailAddress ?? "",
    ]),
    raw: members,
    ids: members.map((m) => m.id),
  });
}
```

### 3) `src/commands/member/index.ts` — `addCommand(memberSearchCommand)`

```ts
import { memberSearchCommand } from "./search.js";
// ...
memberCommand.addCommand(memberSearchCommand);
```

`memberGetCommand`/`memberListCommand` 다음 줄에 자연스럽게.

### 4) (검증) — 옵션 상호배타 회귀 가드

phase 3 시나리오에 다음 케이스 포함 — fetch *전*에 throw해야 함:
- positional + 옵션 동시 → 에러
- 인자 전무 → 에러

본 phase에서는 코드만 작성, 시나리오 검증은 phase 3.

## 성공 기준

- [ ] `pnpm run build` 성공
- [ ] `pnpm test` 통과
- [ ] `node dist/index.js member --help` → `search` 노출
- [ ] `node dist/index.js member search --help` → 5개 옵션 노출 (`--email`, `--user-code`, `--user-code-exact`, `--page`, `--size`)
- [ ] `grep -c "memberSearchCommand\|formatMemberSearchResults\|searchMembers" src/commands/member/{search,index}.ts src/formatters/member.ts` → 각 1 이상
- [ ] `git diff --stat` — `src/commands/member/{search,index}.ts`, `src/formatters/member.ts`만 변경

## 주의사항

- **`<keyword>` positional은 optional `[keyword]`** — 옵션만 사용하는 케이스 허용
- **상호배타 검증은 fetch 전**: 잘못된 입력에 API 호출 비용 발생 X. 시나리오 D(phase 3)로 회귀 가드
- **size clamp**: `Math.min(..., 100)` — Dooray API max 100 위반 방지
- **stdout / stderr**: 데이터는 stdout(table/json), 카운트 메시지는 spinner stop이 stderr에 — 기존 패턴
- **commander option key**: `--user-code` → `opts.userCode`, `--user-code-exact` → `opts.userCodeExact` (camelCase)
- **빈 결과 처리**: `result: []` 면 빈 테이블 출력. 별도 처리 불필요(formatter가 자동)

## Blocked 조건

- phase 1의 `searchMembers` 메서드 부재 → `PHASE_BLOCKED: phase 1 미완료`
- `formatMemberList` 패턴이 호환 불가하게 변경됨 → `PHASE_BLOCKED: formatter 패턴 변경`
