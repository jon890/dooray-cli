# Phase 1: vitest setup + URL parser + standalone API + resolvePostInput 헬퍼

## 컨텍스트

Issue #16 — post 하위 12개 명령에 통합 입력 방식 도입의 인프라. 본 phase 산출물 위에 phase 2-4가 12개 명령을 일괄 적용. ADR-020.

### 먼저 읽을 파일

- `docs/adr.md` ADR-020 — 결정 근거 + 분기 규칙 (필수)
- `src/api/client.ts` `getPost` (193:) — 기존 패턴
- `src/api/types.ts` `PostDetail` (171:) — `project: ProjectInfo`, `taskNumber`, `number`, `id` 필드 확인
- `src/resolvers/project.ts`, `src/resolvers/post.ts` — resolvePostInput 내부에서 호출
- `src/utils/errors.ts` — `DoorayCliError` 시그니처
- `src/utils/exit-codes.ts` — `EXIT_PARAM_ERROR`
- `package.json` — devDep / scripts 추가 위치, tsup 설정
- `tsconfig.json` — vitest는 별도 설정 불필요하지만 호환 확인

## 작업 목록 (5개)

### 1) vitest 인프라 설치

```bash
# cwd: /Users/nhn/personal/dooray-cli
pnpm add -D vitest
```

`package.json` scripts 추가:
```json
"test": "vitest run",
"test:watch": "vitest"
```

`vitest.config.ts`는 **생성하지 않음** — 디폴트로 `*.test.ts` 자동 검색됨. 필요시 후속에서 추가.

확인: `pnpm test` 실행 시 "no test files found"는 아직 정상 (테스트 파일 작업 3·4번에서 추가).

### 2) URL parser — `src/utils/dooray-url.ts`

```ts
const TASK_URL_RE = /^https?:\/\/[\w.-]+\.dooray\.com\/task\/to\/(\d+)(?:[/?#].*)?$/;

export function parseDoorayTaskUrl(input: string): string | null {
  const m = TASK_URL_RE.exec(input);
  return m ? m[1] : null;
}

export function isLikelyDoorayUrl(input: string): boolean {
  return /^https?:\/\//.test(input);
}
```

### 3) URL parser 단위 테스트 — `src/utils/dooray-url.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { parseDoorayTaskUrl, isLikelyDoorayUrl } from "./dooray-url.js";

describe("parseDoorayTaskUrl", () => {
  it("정상 URL에서 postId 추출", () => {
    expect(parseDoorayTaskUrl("https://<tenant>.dooray.com/task/to/1234567890123456789"))
      .toBe("1234567890123456789");
  });
  it("query string 무시", () => {
    expect(parseDoorayTaskUrl("https://x.dooray.com/task/to/123?projectScope=from_to_cc"))
      .toBe("123");
  });
  it("hash 무시", () => {
    expect(parseDoorayTaskUrl("https://x.dooray.com/task/to/123#section"))
      .toBe("123");
  });
  it("trailing slash 허용", () => {
    expect(parseDoorayTaskUrl("https://x.dooray.com/task/to/123/")).toBe("123");
  });
  it("dooray.com 도메인이 아니면 null", () => {
    expect(parseDoorayTaskUrl("https://other.example.com/task/to/123")).toBeNull();
  });
  it("/task/to/ 경로가 아니면 null", () => {
    expect(parseDoorayTaskUrl("https://x.dooray.com/wiki/123")).toBeNull();
  });
  it("URL 형식이 아니면 null", () => {
    expect(parseDoorayTaskUrl("<project>/337")).toBeNull();
    expect(parseDoorayTaskUrl("12345")).toBeNull();
  });
});

describe("isLikelyDoorayUrl", () => {
  it("http(s) prefix 인식", () => {
    expect(isLikelyDoorayUrl("https://x.com")).toBe(true);
    expect(isLikelyDoorayUrl("http://x.com")).toBe(true);
  });
  it("URL 아니면 false", () => {
    expect(isLikelyDoorayUrl("<project>")).toBe(false);
    expect(isLikelyDoorayUrl("12345")).toBe(false);
  });
});
```

### 4) standalone API + resolvePostInput

**`src/api/client.ts`** — 신규 메서드 추가 (기존 `getPost` 옆):

```ts
async getPostStandalone(postId: string): Promise<PostDetailResponse> {
  return this.handle(() =>
    this.client
      .get(`project/v1/posts/${postId}`)
      .json<PostDetailResponse>(),
  );
}
```

**`src/resolvers/post-input.ts`** — 신규:

```ts
import { DoorayApiClient } from "../api/client.js";
import { resolveProject } from "./project.js";
import { resolvePost } from "./post.js";
import { parseDoorayTaskUrl, isLikelyDoorayUrl } from "../utils/dooray-url.js";
import { DoorayCliError } from "../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../utils/exit-codes.js";

export interface PostInputArgs {
  projectArg?: string;
  postNumberArg?: string;
  idOpt?: string;
  urlOpt?: string;
}

export interface ResolvedPostInput {
  projectId: string;
  postId: string;
  projectCode: string;
  postNumber: number;
}

const INPUT_HELP =
  "업무를 식별할 정보가 부족합니다. 다음 중 하나를 입력하세요:\n" +
  "  - <project> <post-number>     예: <project> 337\n" +
  "  - --id <postId>                예: --id 1234567890123456789\n" +
  "  - <Dooray URL>                 예: https://x.dooray.com/task/to/1234567890123456789";

async function resolveByPostId(
  client: DoorayApiClient,
  postId: string,
): Promise<ResolvedPostInput> {
  const res = await client.getPostStandalone(postId);
  const d = res.result;
  return {
    projectId: d.project.id,
    projectCode: d.project.code,
    postId: d.id,
    postNumber: d.number,
  };
}

export async function resolvePostInput(
  client: DoorayApiClient,
  args: PostInputArgs,
): Promise<ResolvedPostInput> {
  const { projectArg, postNumberArg, idOpt, urlOpt } = args;
  const hasPositional = !!projectArg || !!postNumberArg;

  // 1. --id + --url 동시 → 에러
  if (idOpt && urlOpt) {
    throw new DoorayCliError(
      "--id와 --url은 동시에 사용할 수 없습니다.",
      EXIT_PARAM_ERROR,
    );
  }

  // 2. 옵션 + positional 동시 → 에러
  if ((idOpt || urlOpt) && hasPositional) {
    throw new DoorayCliError(
      "--id/--url과 positional 인자(<project> <post-number>)는 동시에 사용할 수 없습니다.",
      EXIT_PARAM_ERROR,
    );
  }

  // 3. --url 단독
  if (urlOpt) {
    const postId = parseDoorayTaskUrl(urlOpt);
    if (!postId) {
      throw new DoorayCliError(
        `--url 형식이 올바르지 않습니다: "${urlOpt}"\n예: https://x.dooray.com/task/to/1234567890123456789`,
        EXIT_PARAM_ERROR,
      );
    }
    return resolveByPostId(client, postId);
  }

  // 4. --id 단독
  if (idOpt) {
    return resolveByPostId(client, idOpt);
  }

  // 5. positional 1개이고 URL 형태
  if (projectArg && !postNumberArg && isLikelyDoorayUrl(projectArg)) {
    const postId = parseDoorayTaskUrl(projectArg);
    if (!postId) {
      throw new DoorayCliError(
        `Dooray URL 형식이 올바르지 않습니다: "${projectArg}"\n예: https://x.dooray.com/task/to/1234567890123456789`,
        EXIT_PARAM_ERROR,
      );
    }
    return resolveByPostId(client, postId);
  }

  // 6. positional 2개 (기존 경로)
  if (projectArg && postNumberArg) {
    const projectId = await resolveProject(client, projectArg);
    const num = Number(postNumberArg);
    if (!Number.isFinite(num) || num <= 0) {
      throw new DoorayCliError(
        `<post-number>가 올바르지 않습니다: "${postNumberArg}"`,
        EXIT_PARAM_ERROR,
      );
    }
    const postId = await resolvePost(client, projectId, num);
    return { projectId, projectCode: projectArg, postId, postNumber: num };
  }

  // 7. 기타: 명시적 안내 에러
  throw new DoorayCliError(INPUT_HELP, EXIT_PARAM_ERROR);
}
```

### 5) resolvePostInput 단위 테스트 — `src/resolvers/post-input.test.ts`

vitest mock으로 `DoorayApiClient`를 흉내내고 분기를 검증.

```ts
import { describe, it, expect, vi } from "vitest";
import { resolvePostInput } from "./post-input.js";
import { DoorayCliError } from "../utils/errors.js";

function makeClient(opts: {
  standalone?: { id: string; projectId: string; projectCode: string; number: number };
  projectId?: string;
  postId?: string;
}) {
  return {
    getPostStandalone: vi.fn().mockResolvedValue({
      result: opts.standalone
        ? {
            id: opts.standalone.id,
            number: opts.standalone.number,
            project: { id: opts.standalone.projectId, code: opts.standalone.projectCode },
          }
        : { id: "stub", number: 1, project: { id: "p1", code: "stub" } },
    }),
  } as any;
}

describe("resolvePostInput", () => {
  it("--id + --url 동시 → 에러", async () => {
    await expect(
      resolvePostInput(makeClient({}), { idOpt: "1", urlOpt: "https://x.dooray.com/task/to/2" }),
    ).rejects.toBeInstanceOf(DoorayCliError);
  });

  it("--id + positional 동시 → 에러", async () => {
    await expect(
      resolvePostInput(makeClient({}), { idOpt: "1", projectArg: "<project>" }),
    ).rejects.toBeInstanceOf(DoorayCliError);
  });

  it("--url 단독 → standalone 호출", async () => {
    const c = makeClient({
      standalone: { id: "999", projectId: "p1", projectCode: "<project>", number: 337 },
    });
    const out = await resolvePostInput(c, {
      urlOpt: "https://x.dooray.com/task/to/999",
    });
    expect(out).toEqual({ projectId: "p1", projectCode: "<project>", postId: "999", postNumber: 337 });
    expect(c.getPostStandalone).toHaveBeenCalledWith("999");
  });

  it("--id 단독 → standalone 호출", async () => {
    const c = makeClient({
      standalone: { id: "999", projectId: "p1", projectCode: "<project>", number: 337 },
    });
    const out = await resolvePostInput(c, { idOpt: "999" });
    expect(out.postId).toBe("999");
    expect(c.getPostStandalone).toHaveBeenCalledWith("999");
  });

  it("positional 1개가 URL이면 standalone", async () => {
    const c = makeClient({
      standalone: { id: "999", projectId: "p1", projectCode: "<project>", number: 337 },
    });
    const out = await resolvePostInput(c, {
      projectArg: "https://x.dooray.com/task/to/999",
    });
    expect(out.postId).toBe("999");
  });

  it("--url 형식 오류 → 에러", async () => {
    await expect(
      resolvePostInput(makeClient({}), { urlOpt: "https://other.example.com/task/to/1" }),
    ).rejects.toBeInstanceOf(DoorayCliError);
  });

  it("입력 전혀 없음 → 안내 에러", async () => {
    await expect(resolvePostInput(makeClient({}), {})).rejects.toThrow(
      /업무를 식별할 정보가 부족합니다/,
    );
  });
});
```

> positional 2개 경로(`resolveProject` + `resolvePost`)는 외부 호출이 많아 본 phase 테스트에서 제외 — phase 5 통합 시나리오에서 검증.

## 성공 기준

- [ ] `pnpm test` 실행 시 모든 테스트 통과 (URL parser 8개 + resolvePostInput 6개 이상)
- [ ] `pnpm build` 성공 (테스트 파일은 번들에 미포함 확인 — `dist/` 크기 변동 없음 또는 테스트 코드 미포함)
- [ ] `grep -c "vitest" package.json` → 2 이상 (devDep + scripts)
- [ ] `ls src/utils/dooray-url.ts src/utils/dooray-url.test.ts src/resolvers/post-input.ts src/resolvers/post-input.test.ts` → 4 파일 존재
- [ ] `grep -c "getPostStandalone" src/api/client.ts` → 1 이상

## 주의사항

- **vitest.config.ts 생성 금지** — 디폴트 동작으로 충분
- **테스트 파일 코로케이션** — `*.test.ts`는 src 내부에 작성
- **번들 영향 점검**: `pnpm build` 후 `dist/index.js` grep으로 "vitest" 또는 테스트 코드 미포함 확인
- **명령 레이어 수정 금지** — 본 phase는 인프라만, 12개 명령 적용은 phase 2-4
- **getPostStandalone 응답 타입은 PostDetailResponse 그대로** — types.ts 변경 불필요
- DoorayCliError throw 메시지가 단위 테스트의 매처 패턴(`/업무를 식별할 정보가 부족합니다/`)과 일치하도록 정확히 작성

## Blocked 조건

- vitest 설치 실패 (네트워크/peer dep 충돌) → `PHASE_BLOCKED: vitest 설치 실패`
- `PostDetail` 타입에 `project.id`, `project.code`, `number`, `id` 필드 부재 → `PHASE_BLOCKED: types 검증 실패`
- tsup 빌드가 테스트 파일을 번들에 포함시킴 → `PHASE_BLOCKED: tsup 설정 변경 필요`
