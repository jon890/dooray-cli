# Phase 01 — 8 file 명령 `--json` / `--quiet` 분기 추가 + 단위 테스트 + README/SKILL 갱신

## 컨텍스트

Issue #73 — file 명령군 8 명령의 `--json` 출력 스키마 통일 (ADR-031).

**현재 상태**:
| 명령 | post file | wiki page file |
|---|---|---|
| `list` | ✅ output() | ✅ output() |
| `upload` | ✅ printJson(res.result) | ❌ plain text |
| `download` | ❌ outputPath plain | ❌ outputPath plain |
| `download-all` | ❌ plain | ❌ plain |
| `delete` | ❌ plain | ❌ plain |

**ADR-031 결정 스키마**:
- `upload`: `--json` = `res.result` raw / `--quiet` = `id` 만
- `download`: `--json` = `{ outputPath, fileName, size }` / `--quiet` = `outputPath` 만
- `download-all`: `--json` = `{ count, succeeded: [{path, fileName}], failed: [{fileId, error}] }` / 부분 실패 시 exit 1
- `delete`: `--json` = `{ fileId, status: "deleted" }` / `--quiet` = `fileId` 만

코드 컨텍스트:
- `src/formatters/table.ts` — `printJson` 헬퍼 (이미 존재)
- `src/commands/post/file/{upload,download,download-all,delete}.ts` — post file 4 파일
- `src/commands/wiki/page-file/{upload,download,download-all,delete}.ts` — wiki page file 4 파일
- 기존 `optsWithGlobals()` + `OutputOptions` 패턴 ([upload.ts:21] 참조)

## 변경 파일 (정확)

기대 결과 (총 11 파일):
```
src/commands/post/file/upload.ts                            (수정 — 스키마 점검 + quiet 정합화)
src/commands/post/file/download.ts                          (수정 — --json/--quiet 분기 신설)
src/commands/post/file/download-all.ts                      (수정 — --json/--quiet + 부분 실패 표현)
src/commands/post/file/delete.ts                            (수정 — --json/--quiet 분기 신설)
src/commands/wiki/page-file/upload.ts                       (수정 — --json/--quiet 분기 신설)
src/commands/wiki/page-file/download.ts                     (수정 — --json/--quiet 분기 신설)
src/commands/wiki/page-file/download-all.ts                 (수정 — --json/--quiet + 부분 실패 표현)
src/commands/wiki/page-file/delete.ts                       (수정 — --json/--quiet 분기 신설)
README.md                                                   (수정 — file 명령군 --json 사용 예 섹션)
skills/dooray-cli/SKILL.md                                  (수정 — 빠른 참조 표 + 자동화 시나리오)
tasks/040-feat-file-commands-json-output/index.json         (완료 마킹)
```

**planning docs (CLAUDE.md / docs/adr.md / docs/code-architecture.md) 는 task 생성 시점에 main 직접 commit 으로 선반영** — phase 안에서 추가 변경 금지.

## 작업 항목 (5개 이하)

### 1. `download` 양 명령군 (post file + wiki page file) — 2 파일

```ts
// src/commands/post/file/download.ts (wiki 도 동일 패턴)
import { printJson } from "../../../formatters/table.js";
import { type OutputOptions } from "../../../formatters/table.js";

// action 안에서 globalOpts 가져오기 (이미 존재하면 skip)
const globalOpts = fileDownloadCommand.optsWithGlobals() as OutputOptions;

// ...기존 download 호출...
const { buffer, fileName } = await client.downloadPostFile(...);
const safeName = path.basename(decodeURIComponent(fileName));  // CLI7: path-traversal 방지
const outputPath = path.join(opts.output ?? ".", safeName);
await writeFile(outputPath, Buffer.from(buffer));
stopSpinner(true, "다운로드 완료");

// ADR-031: --json / --quiet / plain 3 모드 분기
if (globalOpts.json) {
  printJson({ outputPath, fileName: safeName, size: buffer.byteLength });
} else if (globalOpts.quiet) {
  process.stdout.write(`${outputPath}\n`);
} else {
  process.stdout.write(`${outputPath}\n`);
}
```

**주의 사항**:
- quiet vs plain 동작 동일성: 현재 `download` 의 plain text 출력이 이미 `outputPath\n` 한 줄이라 quiet 와 동일.
  plain 그대로 유지 + json 모드만 추가.
  `--quiet` 명시 시 동일 결과지만 의미 일관성 위해 분기는 유지.
- **CLI7 basename 필수**: 아래 3 파일에 `basename(decodeURIComponent(fileName))` 미적용 상태.
  본 phase 에서 반드시 적용.
  - `post/file/download.ts`
  - `post/file/download-all.ts`
  - `wiki/page-file/download-all.ts`
  - `wiki/page-file/download.ts` 는 이미 적용 → skip

### 2. `download-all` 양 명령군 — 2 파일

```ts
// 핵심 로직 — 기존 successCount + failures 배열 활용
const succeeded: { path: string; fileName: string }[] = [];
const failed: { fileId: string; error: string }[] = [];

for (const f of allFiles) {
  try {
    const { buffer, fileName } = await client.downloadPostFile(projectId, postId, f.id);
    const safeName = path.basename(decodeURIComponent(fileName));  // CLI7: path-traversal 방지
    const outputPath = path.join(outDir, safeName);
    await writeFile(outputPath, Buffer.from(buffer));
    succeeded.push({ path: outputPath, fileName: safeName });
    // plain 모드만 ✓ 마크 출력 (json/quiet 는 마지막에 일괄)
    if (!globalOpts.json && !globalOpts.quiet) {
      process.stdout.write(`✓ ${fileName}\n`);
    }
  } catch (e) {
    failed.push({ fileId: f.id, error: e instanceof Error ? e.message : String(e) });
    if (!globalOpts.json) {
      process.stderr.write(`✗ ${f.name} (${f.id}): ${e instanceof Error ? e.message : String(e)}\n`);
    }
  }
}

// ADR-031 출력
if (globalOpts.json) {
  printJson({ count: allFiles.length, succeeded, failed });
} else if (globalOpts.quiet) {
  for (const s of succeeded) process.stdout.write(`${s.path}\n`);
} else {
  process.stdout.write(`\n완료: ${succeeded.length}/${allFiles.length}\n`);
}

// 부분 실패 시 exit 1
if (failed.length > 0) process.exitCode = 1;
```

**주의 사항**:
- `process.exit(1)` 대신 `process.exitCode = 1` — Node 의 비동기 flush 보장 (기존 패턴)
- **빈 파일 조기 반환**: 양 명령군 모두 파일 0개 시 기존 plain "첨부파일이 없습니다" early return 존재.
  `--json` 모드에서는 `{ count: 0, succeeded: [], failed: [] }` 로 반환해야 ADR-031 스키마 일관.
  early return 분기에 `globalOpts.json` 체크 추가
- **wiki/download-all.ts orphan import 제거**: 기존 `EXIT_API_ERROR` import 가 `process.exitCode = 1` 전환 후 미사용.
  orphan import 정리

### 3. `delete` 양 명령군 — 2 파일

```ts
// 핵심 분기
await client.deletePostFile(projectId, postId, fileId);
stopSpinner(true, "삭제 완료");

if (globalOpts.json) {
  printJson({ fileId, status: "deleted" });
} else if (globalOpts.quiet) {
  process.stdout.write(`${fileId}\n`);
} else {
  process.stdout.write(`파일(${fileId})이 삭제되었습니다.\n`);
}
```

### 4. `upload` 양 명령군 — 2 파일

post file `upload.ts` 는 이미 `--json` 동작 (line 74-79). wiki page file `upload.ts` 만 신규 추가:

```ts
// wiki page file upload — 기존 plain 출력 (line 85-92) 을 json/quiet/plain 3 모드 분기로
if (globalOpts.json) {
  printJson(res.result);
} else if (globalOpts.quiet) {
  process.stdout.write(`${res.result.id}\n`);
} else {
  // 기존 plain 출력 + inline_image snippet 안내
  process.stdout.write(`attachFileId: ${res.result.attachFileId}\n`);
  process.stdout.write(`name:         ${res.result.name}\n`);
  process.stdout.write(`size:         ${res.result.size}\n`);
  process.stdout.write(`type:         ${res.result.type}\n`);
  if (fileType === "inline_image") {
    process.stdout.write("\n본문 삽입용 markdown snippet (직접 wiki page edit 으로 본문에 박으세요):\n");
    process.stdout.write(`  ![${res.result.name}](/wikis/${wikiId}/files/${res.result.attachFileId})\n`);
  }
}
```

**point**: post file `upload.ts` 도 quiet 동작 (line 76-77) 점검 — `${res.result.id}` 로 일관. 변경 없으면 skip.

`optsWithGlobals()` 호출이 4 명령에 없으면 추가 — post file 의 upload.ts:21 패턴 mirror.

### 5. 단위 테스트 + README + SKILL + 빌드 검증

#### 단위 테스트 (vitest)
8 파일에 대한 단위 테스트는 mock client + `process.stdout.write` spy 로 구성.
단 명령 단위 테스트는 commander 의 action 호출이 복잡해서 — **핵심 분기 로직만 헬퍼로 추출해 테스트**하는 방안 검토:

```ts
// 예: src/formatters/file-output.ts (신규) — 공통 헬퍼
export function emitDownloadResult(
  globalOpts: OutputOptions,
  result: { outputPath: string; fileName: string; size: number },
): void { ... }

export function emitDownloadAllResult(
  globalOpts: OutputOptions,
  data: { count: number; succeeded: {...}[]; failed: {...}[] },
): void { ... }

// 등 명령별 emit 함수 4개
```

테스트는 `formatters/file-output.test.ts` — 각 함수 × 3 모드 (json/quiet/plain) = 12 케이스. spy 패턴은 `formatters/wiki-comment.test.ts` 참조.

executor 가 helper 추출 vs inline 분기 중 판단.
inline 은 8 파일 복붙이라 helper 추출 권장.
helper 추출 시 단위 테스트 작성 비용 ↓ + 동일 mirror 패턴 회귀 방지.

#### README.md
`### 첨부파일` 섹션 (post file) + `#### 위키 페이지 첨부파일` (wiki page file) 둘 다에 `--json` 사용 예 추가:

```bash
# 자동화 친화 — --json 으로 jq 가공
dooray post file download <project> <num> --file-id <id> -o ./ --json
# 출력: {"outputPath": "./<fileName>", "fileName": "...", "size": 12345}

dooray post file download-all <project> <num> -o ./ --json | jq '.failed'
# 출력: [] 또는 [{"fileId": "...", "error": "..."}]

dooray post file delete <project> <num> --file-id <id> --json
# 출력: {"fileId": "...", "status": "deleted"}
```

wiki page file 도 동일 형식 (`post` → `wiki page` 만 다름).

#### skills/dooray-cli/SKILL.md
빠른 참조 표에 `--json` 지원 옵션 명시 + 자동화 시나리오 1 줄:

```markdown
| `dooray post file <verb> ... --json` | 자동화 파싱 — `download` = outputPath/fileName/size, `download-all` = count/succeeded/failed (부분 실패 시 exit 1), `delete` = fileId/status (ADR-031) |
```

자동화 시나리오:
```bash
# 첨부 일괄 다운로드 후 실패 분리
RESULT=$(dooray post file download-all <p> <n> -o ./ --json)
echo "$RESULT" | jq -r '.failed[] | "\(.fileId): \(.error)"' >&2
echo "$RESULT" | jq -r '.succeeded[].path'
```

#### 빌드 + 실증 검증
```bash
pnpm tsc --noEmit 2>&1 | grep -cE "^src/"  # 기대: 0
pnpm build && pnpm test                      # 기대: exit 0

# 실증 (사용자 환경)
node dist/index.js post file download <p> <n> --file-id <id> -o /tmp/ --json | jq .
# 기대: {"outputPath": "/tmp/<name>", "fileName": "<name>", "size": <bytes>}

node dist/index.js wiki page file delete <p> <pid> --file-id <id> --json
# 기대: {"fileId": "<id>", "status": "deleted"}
```

## code-review-pitfalls 회피 항목

- **1-x (spinner 순서)**: 기존 spinner 패턴 그대로 유지 — try/catch 안에서 stopSpinner. 변경 없음
- **3-3 (테스트 mock)**: helper 추출 시 `process.stdout.write` spy 패턴 — `wiki-comment.test.ts` 답습
- **4-x (외과적 변경)**: action 함수의 출력 분기만 수정. positional 분기 / resolver 호출 / API 호출 동작 무변경
- **CLI13 (출력 분기 누락)**: 본 task 가 정확히 CLI13 회피 — 4 명령 8 파일 모두 동일 옵션 분기 적용. 양 명령군 mirror 필수
- **CLI20 (dry-run 위치 비대칭)**: 본 task 는 dry-run 무관 — `--json` 만. 단 동일 검증 원칙 적용 (post + wiki 양쪽 동일 위치)

## 성공 기준

```bash
# cwd: /Users/nhn/personal/dooray-cli

pnpm tsc --noEmit 2>&1 | grep -cE "^src/"
pnpm build && pnpm test
# 둘 다 exit 0

# 8 파일 모두 --json 분기 존재
for f in src/commands/post/file/{upload,download,download-all,delete}.ts \
         src/commands/wiki/page-file/{upload,download,download-all,delete}.ts; do
  grep -q "globalOpts.json" "$f" || echo "MISSING json: $f"
done
# 기대: 출력 없음 (8 파일 모두 분기 존재)

# 8 파일 모두 --quiet 분기 존재
for f in src/commands/post/file/{upload,download,download-all,delete}.ts \
         src/commands/wiki/page-file/{upload,download,download-all,delete}.ts; do
  grep -q "globalOpts.quiet" "$f" || echo "MISSING quiet: $f"
done
# 기대: 출력 없음

# download-all 의 부분 실패 → exit code
grep -nE "process\.exitCode = 1" src/commands/{post/file,wiki/page-file}/download-all.ts
# 기대: 2줄 (양쪽 명령군)

# README 사용 예
grep -c "file.*--json" README.md
# 기대: 4 이상 (양 명령군 × 사용 예 2 이상)
```

### index.json 완료 마킹 (마지막 phase 의무)

`tasks/040-feat-file-commands-json-output/index.json` 의 다음 필드를 갱신:
- `status`: `"completed"`
- `current_phase`: `2` (total_phases + 1)
- `phases[0].status`: `"completed"`

## 작업 외 금지

- planning docs (CLAUDE.md / docs/adr.md / docs/code-architecture.md) 변경 금지 — task 생성 시점 main commit 으로 반영됨
- 명령 시그니처 / 옵션 추가 금지 — 본 task 는 출력 분기만
- 다른 명령군 (post comment file, wiki page comment 등) 영향 금지
- 새 ADR 추가 금지 — ADR-031 만
- 부분 실패 정책 변경 금지 — exit 1 그대로

## 커밋

```bash
# cwd: /Users/nhn/personal/dooray-cli
# branch: feat/040-feat-file-commands-json-output (main 에서 분기)
git add src/commands/post/file/ src/commands/wiki/page-file/ \
        src/formatters/file-output.ts src/formatters/file-output.test.ts \
        README.md skills/dooray-cli/SKILL.md \
        tasks/040-feat-file-commands-json-output/index.json
git commit -m "$(cat <<'EOF'
feat(commands): unify --json/--quiet output schema across file commands (Issue #73, ADR-031)

post file + wiki page file 동의 4 명령 (upload/download/download-all/delete)
= 8 파일의 --json 출력 스키마 통일. 자동화 스크립트가 두 명령군을 동일 코드로
parse 가능.

스키마 (ADR-031):
- upload: --json = res.result raw / --quiet = id
- download: --json = {outputPath, fileName, size} / --quiet = outputPath
- download-all: --json = {count, succeeded, failed} / 부분 실패 시 exit 1
- delete: --json = {fileId, status: 'deleted'} / --quiet = fileId

- formatters/file-output.ts: 공통 emit 헬퍼 4종 추출 (helper 단위 테스트 12 케이스)
- 8 명령 파일에 globalOpts.json/quiet 분기 추가
- README + skills/dooray-cli/SKILL.md: --json 사용 예 + 자동화 시나리오

planning docs (CLAUDE.md / adr.md ADR-031 / code-arch) 는 task 생성 시점
main commit 으로 선반영.

closes #73
EOF
)"
```
