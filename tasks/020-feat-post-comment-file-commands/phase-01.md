# Phase 01 — API client (getPostComment) + markdown helper + 단위 테스트

## 컨텍스트

ADR-024 기반. Dooray 가 댓글 전용 attachment endpoint 를 미지원하므로 4 명령은 모두 기존 post-level API 의 합성으로 구현. 본 phase 는 합성에 필요한 **유일한 신규 인프라** 인 (a) `getPostComment` 단건 조회 client 메서드, (b) 댓글 본문에 markdown reference 를 append/제거하는 utils 헬퍼만 추가.

다음 phase 에서 사용:
- `comment file list` → `getPostComment` 호출 후 `.files` 반환
- `comment file upload/delete` → 본문 markdown 조작에 utils 헬퍼 사용

### 먼저 읽을 파일

- `src/api/client.ts` `getPostComments` (L284) — list 엔드포인트 패턴 참고. 단건 GET 은 path 끝에 `/{logId}` 만 추가
- `src/api/client.ts` `updatePostComment` (L310) — 댓글 PUT 패턴. body 의 `body.content` 가 markdown
- `src/api/types.ts` `PostComment` / `PostCommentListResponse` — 단건 응답 타입 도출 base
- `src/utils/feedback-meta.ts` — utils 단위 테스트 형식 참고

## 작업 항목 (4개)

### 1) `src/api/types.ts` — 단건 응답 타입 추가

기존 `PostCommentListResponse` 를 보고 단건 변형 추가:

```ts
// 기존 PostCommentListResponse: DoorayApiResponse<PostComment[]>
// 신규
export type GetPostCommentResponse = DoorayApiResponse<PostComment>;
```

`PostComment` 타입에 `files: PostFileDetail[]` 필드가 이미 있는지 확인. 없으면 추가 (검증으로 확인됨 — 응답에 `files: []` 항상 존재).

### 2) `src/api/client.ts` — `getPostComment` 단건 조회 메서드

`getPostComments` (L284) 옆에 추가:

```ts
async getPostComment(
  projectId: string,
  postId: string,
  logId: string,
): Promise<GetPostCommentResponse> {
  try {
    return await this.api
      .get(`project/v1/projects/${projectId}/posts/${postId}/logs/${logId}`)
      .json<GetPostCommentResponse>();
  } catch (e) {
    return toDoorayCliError(e);
  }
}
```

`try { ... } catch (e) { return toDoorayCliError(e); }` 패턴 — 기존 모든 client 메서드 (예: `getPostFiles` L541) 와 일관. ky HTTPError 누설 방지.

### 3) `src/utils/comment-files.ts` — markdown reference 헬퍼 (신규)

```ts
/**
 * Dooray 댓글/post 본문에 첨부 파일을 inline 으로 표시하는 markdown 형식.
 * 형식: `![filename](/files/<fileId>)`
 *
 * Dooray 가 댓글 전용 attachment endpoint 를 제공하지 않으므로 (ADR-024)
 * `dooray post comment file upload` 는 post-level 파일 업로드 후 이 헬퍼로
 * 댓글 본문에 reference 를 append, `delete` 는 reference 를 제거하는 방식
 * 으로 동작한다.
 */

export function appendFileReference(body: string, fileName: string, fileId: string): string {
  const safeName = fileName.replace(/[\[\]]/g, "");
  const ref = `![${safeName}](/files/${fileId})`;
  if (body.length === 0) return ref;
  const trailing = body.endsWith("\n") ? "" : "\n";
  return `${body}${trailing}\n${ref}`;
}

/**
 * 댓글 본문에서 특정 fileId 의 markdown reference 를 제거.
 * `![*](/files/<fileId>)` 패턴을 줄 단위로 매치하여 그 줄 전체 제거.
 * 같은 줄에 다른 텍스트가 있으면 reference 만 빈 문자열로 치환.
 */
export function removeFileReference(body: string, fileId: string): string {
  const escaped = fileId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const refSource = `!\\[[^\\]]*\\]\\(/files/${escaped}\\)`;
  const lineRe = new RegExp(`^[ \\t]*${refSource}[ \\t]*$\\n?`, "gm");
  const inlineRe = new RegExp(refSource, "g");
  return body.replace(lineRe, "").replace(inlineRe, "");
}
```

### 4) `src/utils/comment-files.test.ts` — 단위 테스트 (신규)

```ts
import { describe, it, expect } from "vitest";
import { appendFileReference, removeFileReference } from "./comment-files.js";

describe("appendFileReference", () => {
  it("빈 본문 → reference 만 반환", () => {
    expect(appendFileReference("", "image.png", "1234567890123456789"))
      .toBe("![image.png](/files/1234567890123456789)");
  });

  it("기존 본문 끝에 빈 줄로 분리해서 append", () => {
    const result = appendFileReference("hello world", "x.png", "9876543210987654321");
    expect(result).toBe("hello world\n\n![x.png](/files/9876543210987654321)");
  });

  it("기존 본문이 개행으로 끝나도 빈 줄 정확히 1 개", () => {
    const result = appendFileReference("line1\n", "y.png", "1111");
    expect(result).toBe("line1\n\n![y.png](/files/1111)");
  });

  it("filename 의 [] 는 이스케이프 (markdown 깨짐 방지)", () => {
    expect(appendFileReference("", "[draft].png", "222"))
      .toBe("![draft.png](/files/222)");
  });
});

describe("removeFileReference", () => {
  it("reference 만 있는 줄은 통째로 제거", () => {
    const body = "hello\n![x.png](/files/123)\nworld";
    expect(removeFileReference(body, "123")).toBe("hello\nworld");
  });

  it("줄 끝에 섞인 reference 는 빈 문자열로 치환 (텍스트 보존)", () => {
    const body = "see ![x.png](/files/123) here";
    expect(removeFileReference(body, "123")).toBe("see  here");
  });

  it("다른 fileId 는 안 건드림", () => {
    const body = "![a.png](/files/111)\n![b.png](/files/222)";
    expect(removeFileReference(body, "111")).toBe("![b.png](/files/222)");
  });

  it("같은 fileId 다중 출현 모두 제거", () => {
    const body = "![a](/files/9)\nmid\n![a](/files/9)";
    expect(removeFileReference(body, "9")).toBe("mid\n");
  });

  it("regex 특수문자 fileId 안전 (이스케이프)", () => {
    expect(removeFileReference("![x](/files/abc.def)", "abc.def")).toBe("");
    expect(removeFileReference("![x](/files/abcXdef)", "abc.def"))
      .toBe("![x](/files/abcXdef)");
  });
});
```

## 성공 기준

```bash
# cwd: /Users/nhn/personal/dooray-cli

# 1. 빌드 + 테스트 통과 — 신규 테스트 10 케이스 (appendFileReference 4 + removeFileReference 6)
pnpm run build && pnpm test

# 2. 신규 client 메서드
grep -nE "async getPostComment\b" src/api/client.ts
# 기대: 1 줄

# 3. 단건 응답 타입 export
grep -nE "export type GetPostCommentResponse" src/api/types.ts
# 기대: 1 줄

# 4. utils 신규 파일 + export 2 개
grep -cE "export function (appendFileReference|removeFileReference)" src/utils/comment-files.ts
# 기대: 2

# 5. try/catch + toDoorayCliError 패턴 적용 (getPostComment 안)
sed -n '/async getPostComment\b/,/^  }/p' src/api/client.ts | grep -c "toDoorayCliError"
# 기대: 1
```

## 작업 외 금지

- 4 명령 구현 — phase-02 에서
- README/SKILL.md 갱신 — phase-03 에서
- 별도 ADR 추가 — ADR-024 가 이미 본 plan 의 결정 root
- `getPostComments` (list) 시그니처 변경 금지
- markdown 헬퍼에 `escapeMarkdown` 같은 일반화 추가 금지 (scope 외)

## 주의사항 (common-pitfalls 사전 소진)

- **CLI3/CLI4 (atomic write / mode 0o600)**: `~/.dooray/cache/` 쓰기 없음 — 해당 없음
- **CLI5 (`as Type` 단언)**: `.json<T>()` generic 사용. `as` 단언 0 건
- **CLI6 (markdown body 안전)**: `appendFileReference` 가 filename 의 `[]` 이스케이프. 단위 테스트로 가드
- **PII 게이트**: 테스트 fileId 는 dummy `1234567890123456789` / `9876543210987654321` 또는 짧은 더미 (`123`, `222`) 만

## Blocked 조건

- `PostComment` 타입에 `files` 필드 부재 → types.ts 에 함께 추가
