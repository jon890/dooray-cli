# Phase 01 — attachment-check util + tests

## 컨텍스트

GitHub Issue #35 항목 2. `post edit` / `post comment edit` 는 본문을 full replace 하므로, 사용자가 새 본문에 기존 attachment markdown 을 빠뜨리면 이미지가 사라진다 (file 자체는 서버에 남아있지만 본문 reference 가 끊어짐).

본 phase 에서는 명령은 손대지 않고, 검출 로직만 util 로 분리하여 단위 테스트로 정확성을 보장한다.

코드 현황:
- `src/api/types.ts:212-216` — `Post.files: PostFile[]`, `Post.fileIdList: string[]`
- `src/api/types.ts:285-312` — `PostComment.files?: PostCommentFile[]`, `PostComment.body.content`
- `src/utils/` — body-input.ts, dooray-message.ts, mention.ts 등 단일 책임 helper 들이 같은 디렉터리에 위치

기존 패턴: util 은 함수 export + `*.test.ts` (vitest) 가 같은 디렉터리. (예: `dooray-url.ts` + `dooray-url.test.ts`, `mention.ts` + `mention.test.ts`)

직전 plan 과의 관계: 014~020 모두 본 영역을 손대지 않음. 충돌 없음.

```bash
# cwd: /Users/nhn/personal/dooray-cli
git log origin/main --oneline -10 -- src/utils/ src/commands/post/edit.ts src/commands/post/comment/edit.ts
```

## 변경 파일 (정확)

```bash
# cwd: /Users/nhn/personal/dooray-cli
git diff <base>..HEAD --name-only -- src/utils/
```

기대 결과 (총 2 파일, 신규):
```
src/utils/attachment-check.ts
src/utils/attachment-check.test.ts
```

## 작업 항목

### 1. `src/utils/attachment-check.ts` — 검출 helper

검출 대상:
- markdown 인라인 이미지: `![alt](/files/<fileId>)`
- markdown 일반 링크: `[text](/files/<fileId>)`
- 양쪽 모두 동일 regex 로 매칭 (앞의 `!` 만 다름)

```ts
// 본문에 등장하는 모든 attachment file id 를 추출.
// markdown link/image 의 (/files/<id>) 형태만 인정한다.
export function extractAttachmentFileIds(body: string): Set<string> {
  const ids = new Set<string>();
  // !?\[...\]\(/files/<id>...\)  — 괄호 안에 query 가 붙을 수도 있어 첫 토큰만 캡처
  const re = /!?\[[^\]]*\]\(\/files\/([^\s)]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    ids.add(m[1]);
  }
  return ids;
}

// 기존 attachment 의 id 목록과 새 본문 비교 → 새 본문에서 빠진 id 반환.
// 기존 attachment 가 본문에 없었던 경우 (예: 단순 첨부) 는 dropped 로 보지 않음
// — 즉 "원래 본문에 reference 가 있었는데 새 본문에 없는 것" 만 dropped.
export interface DroppedAttachment {
  id: string;
  name?: string;
}

export function findDroppedAttachments(
  oldBody: string,
  newBody: string,
  attachments: ReadonlyArray<{ id: string; name?: string }>,
): DroppedAttachment[] {
  const oldIds = extractAttachmentFileIds(oldBody);
  const newIds = extractAttachmentFileIds(newBody);
  const dropped: DroppedAttachment[] = [];
  for (const att of attachments) {
    if (oldIds.has(att.id) && !newIds.has(att.id)) {
      dropped.push({ id: att.id, name: att.name });
    }
  }
  return dropped;
}
```

**규칙**:
- regex 는 단일 라인 패턴 (markdown alt 안에 줄바꿈 없음 가정 — Dooray 본문 일반 패턴).
- `oldIds.has(att.id) && !newIds.has(att.id)` — 양쪽 조건 모두 필요. 새 attachment 추가는 무시. 원래 본문에 없던 attachment (non-inline) 도 무시.

### 2. `src/utils/attachment-check.test.ts` — 단위 테스트

다음 케이스 (총 8개):

```ts
import { describe, it, expect } from "vitest";
import { extractAttachmentFileIds, findDroppedAttachments } from "./attachment-check.js";

describe("extractAttachmentFileIds", () => {
  it("인라인 이미지 markdown 에서 id 추출", () => {
    expect(extractAttachmentFileIds("text ![](/files/123) more"))
      .toEqual(new Set(["123"]));
  });
  it("일반 링크 markdown 에서도 id 추출", () => {
    expect(extractAttachmentFileIds("[file](/files/abc-456)"))
      .toEqual(new Set(["abc-456"]));
  });
  it("여러 attachment 동시 추출", () => {
    expect(extractAttachmentFileIds("![](/files/1) ![alt](/files/2) [a](/files/3)"))
      .toEqual(new Set(["1", "2", "3"]));
  });
  it("attachment 가 없으면 빈 Set", () => {
    expect(extractAttachmentFileIds("plain text without files")).toEqual(new Set());
  });
  it("/files/ prefix 없는 경로는 무시", () => {
    expect(extractAttachmentFileIds("![](/uploads/123) [x](/other/456)"))
      .toEqual(new Set());
  });
});

describe("findDroppedAttachments", () => {
  it("이전 본문에 있고 새 본문에 없으면 dropped", () => {
    const dropped = findDroppedAttachments(
      "old ![](/files/1)",
      "new content",
      [{ id: "1", name: "img.png" }],
    );
    expect(dropped).toEqual([{ id: "1", name: "img.png" }]);
  });
  it("이전 본문에 reference 가 없었으면 dropped 아님 (non-inline 첨부)", () => {
    const dropped = findDroppedAttachments(
      "old text",
      "new text",
      [{ id: "1", name: "doc.pdf" }],
    );
    expect(dropped).toEqual([]);
  });
  it("새 본문에 그대로 있으면 dropped 아님", () => {
    const dropped = findDroppedAttachments(
      "![](/files/1)",
      "modified ![](/files/1)",
      [{ id: "1" }],
    );
    expect(dropped).toEqual([]);
  });
});
```

## 성공 기준

```bash
# cwd: /Users/nhn/personal/dooray-cli

# 1. 빌드 + 테스트 통과
pnpm build && pnpm test
# 기대: exit 0

# 2. util export 확인
grep -nE "export function (extractAttachmentFileIds|findDroppedAttachments)" src/utils/attachment-check.ts
# 기대: 2줄 매칭

# 3. 테스트 케이스 8개
grep -cE "^\s*it\(" src/utils/attachment-check.test.ts
# 기대: 8
```

## 작업 외 금지

- 명령 (`post edit` / `post comment edit`) 통합 금지 — phase-02 에서
- README / SKILL.md 갱신 금지 — phase-03 에서
- 다른 markdown 파싱 (mermaid, code block 등) 추가 금지
- `parseDoorayTaskUrl` 같은 기존 util 변경 금지

## 커밋

```bash
# cwd: /Users/nhn/personal/dooray-cli
# branch: feat/021-feat-edit-attachment-guard
git add src/utils/attachment-check.ts src/utils/attachment-check.test.ts
git commit -m "feat(utils): add attachment-check helpers for body-replace edit guard

Issue #35 item 2 (phase 1/3): extract /files/<id> markdown references and
diff old vs new body to find dropped attachments. Pure helper + 8 tests.
Integration with post edit / post comment edit follows in phase 2."
```
