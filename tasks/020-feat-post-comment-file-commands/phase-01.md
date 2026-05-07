# Phase 01 — API client 4종 메서드 + types (comment file CRUD)

## 컨텍스트

GitHub Issue #34 — 댓글 본문에 인라인 이미지/파일을 자연스럽게 넣을 수 있도록 `post comment file *` 4종 명령 신설. 본 phase 에서는 명령은 만들지 않고 API 레이어만 준비.

API 엔드포인트 가정 (post file 의 `posts/{postId}/files` 패턴 + comment 의 `posts/{postId}/logs/{logId}` 패턴 결합):

| 동작 | 메서드 | 경로 |
|---|---|---|
| 업로드 | POST | `project/v1/projects/{projectId}/posts/{postId}/logs/{logId}/files` (307 처리 — ADR-015) |
| 목록 | GET | `project/v1/projects/{projectId}/posts/{postId}/logs/{logId}/files` |
| 다운로드 | GET | `project/v1/projects/{projectId}/posts/{postId}/logs/{logId}/files/{fileId}` (307 처리) |
| 삭제 | DELETE | `project/v1/projects/{projectId}/posts/{postId}/logs/{logId}/files/{fileId}` |

> **검증 의무**: 이슈 작성자가 raw curl 로 동작 확인했다는 단서가 있음. executor 는 phase 실행 중 1건 업로드 + list + delete 를 실제 호출하여 200/201 응답을 받아야 통과 (성공 기준에 포함).

코드 현황 — 참조 패턴:
- `src/api/client.ts:513-624` — post file CRUD 4종 (uploadPostFile, downloadPostFile, listPostFiles, deletePostFile, getPostFile metadata)
- 307 처리 패턴은 `uploadPostFile` (line 569-613) 그대로 재사용
- `src/api/types.ts` — `UploadFileResponse`, `PostFile`, `DoorayApiResponse<T>`, `DoorayApiUnitResponse` 정의 (재사용)

직전 plan 과의 관계: 014~019 모두 client 의 file CRUD 영역을 손대지 않음. 충돌 없음.

```bash
# cwd: /Users/nhn/personal/dooray-cli
git log origin/main --oneline -10 -- src/api/client.ts src/api/types.ts
```

## 변경 파일 (정확)

```bash
# cwd: /Users/nhn/personal/dooray-cli
git diff <base>..HEAD --name-only -- src/api/
```

기대 결과 (총 1 파일, types 는 client.ts 의 import 내에서 재사용 → 변경 없음):
```
src/api/client.ts
```

types 가 신규로 필요하면 `src/api/types.ts` 도 변경. 예상은 `PostCommentFile` 가 `PostFile` 과 동형 → alias 또는 동일 타입 재사용.

## 작업 항목

### 1. types 재사용 점검

```bash
# cwd: /Users/nhn/personal/dooray-cli
grep -n "interface PostFile\|interface UploadFileResponse" src/api/types.ts
```

기존 `PostFile` 의 필드 (id, name, size, mimeType 등) 가 comment file 응답과 호환되면 alias 만:
```ts
export type PostCommentFile = PostFile;
```

호환 안 되면 별도 인터페이스. executor 가 실제 응답으로 확인.

### 2. `src/api/client.ts` — 4종 메서드 추가

`uploadPostFile` / `listPostFiles` / `downloadPostFile` / `deletePostFile` 의 logId 추가 변형. 코드 중복을 피하기 위해 path-builder 헬퍼 신설 권장:

```ts
private commentFilesPath(projectId: string, postId: string, logId: string): string {
  return `project/v1/projects/${projectId}/posts/${postId}/logs/${logId}/files`;
}
```

신규 메서드 시그니처 (4개):

```ts
async uploadPostCommentFile(
  projectId: string,
  postId: string,
  logId: string,
  filePath: string,
): Promise<UploadFileResponse> { /* 307 처리 — uploadPostFile 패턴 그대로, URL 만 commentFilesPath() */ }

async listPostCommentFiles(
  projectId: string,
  postId: string,
  logId: string,
): Promise<DoorayApiResponse<PostFile[]>> {
  return this.api.get(this.commentFilesPath(projectId, postId, logId)).json();
}

async downloadPostCommentFile(
  projectId: string,
  postId: string,
  logId: string,
  fileId: string,
): Promise<{ buffer: ArrayBuffer; fileName: string }> {
  /* 307 처리 — downloadPostFile (line 532-562) 패턴 그대로 */
}

async deletePostCommentFile(
  projectId: string,
  postId: string,
  logId: string,
  fileId: string,
): Promise<DoorayApiUnitResponse> {
  return this.api.delete(`${this.commentFilesPath(projectId, postId, logId)}/${fileId}`).json();
}
```

**중요 — 307 처리 (ADR-015)**: upload 와 download 는 ky 가 자동 redirect 시 Authorization 헤더를 떨어뜨리므로 `redirect: "manual"` 후 location 으로 재요청 + Auth 헤더 재첨부. 기존 `uploadPostFile` / `downloadPostFile` 구현을 **그대로 복사** 후 URL 만 변경.

### 3. 동작 실증 (실행 시점에서 1회 검증)

```bash
# cwd: /Users/nhn/personal/dooray-cli
pnpm build

# 임시 검증 스크립트 (executor 가 실행) — config.json 의 키 사용
node -e '
const { DoorayApiClient } = require("./dist/index.js");
// 실제 검증은 phase-02 의 명령 동작 + 빌드 단계에서 갈음.
// (이 phase 는 메서드 추가만이므로 type-check + build 통과 = 성공)
'
```

**실증 포인트**: phase-02 의 명령 시나리오에서 1회 upload→list→delete 사이클 성공으로 갈음. 본 phase 는 build/test 통과 + grep 으로 메서드 시그니처 확인까지만.

## 성공 기준

```bash
# cwd: /Users/nhn/personal/dooray-cli

# 1. 빌드 + 테스트 통과
pnpm build && pnpm test
# 기대: exit 0

# 2. 4종 메서드 추가
grep -nE "async (uploadPostCommentFile|listPostCommentFiles|downloadPostCommentFile|deletePostCommentFile)" src/api/client.ts
# 기대: 4줄 매칭

# 3. path-builder 헬퍼 추가 (또는 4곳 모두 inline path)
grep -nE "logs/\\\$\\{logId\\}/files|commentFilesPath" src/api/client.ts
# 기대: 1 이상

# 4. 307 처리 패턴 재사용 — manual redirect (upload + download 만 해당)
grep -cE 'redirect:\s*"manual"' src/api/client.ts
# 기대: 4 이상 (기존 2 + 신규 2)
```

## 작업 외 금지

- 신규 명령 (`post comment file *`) 추가 금지 — phase-02 에서
- README / SKILL.md 갱신 금지 — phase-03 에서
- post file CRUD (post 본문 attachment) 메서드 변경 금지
- `getPostFile` 의 metadata-only GET 같은 변형 추가 금지 (이번 phase scope 외)
- ADR 추가 금지 (자명성 게이트 — comment attachment 는 post attachment 와 동일 패턴 → 별도 ADR 가치 없음. 307 처리는 ADR-015 적용)

## 커밋

```bash
# cwd: /Users/nhn/personal/dooray-cli
# branch: feat/020-feat-post-comment-file-commands
git add src/api/client.ts src/api/types.ts
git commit -m "feat(api): add comment file CRUD methods (upload/list/download/delete)

Issue #34: enable comment-scoped attachment API (logs/{logId}/files).
Mirror post file methods; reuse 307 manual-redirect pattern (ADR-015)."
```
