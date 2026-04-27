# Phase 4: post file 5개 명령 + --file-id 옵션화

## 컨텍스트

`post file` 하위 5개 명령(upload/download/download-all/list/delete)에 phase 1 헬퍼 적용. download/delete는 `<file-id>` sub-id를 옵션화(`--file-id`). upload는 `<file-path>` 위치 인자가 있어 별도 검토. ADR-020.

### 먼저 읽을 파일

- `src/commands/post/file/upload.ts`, `download.ts`, `download-all.ts`, `list.ts`, `delete.ts`
- `src/resolvers/post-input.ts` (phase 1)
- phase 3 (`comment/edit.ts`) — 3-arg 분기 패턴 참고

## 명령별 변경

### 1) `file list`

sub-id 없음. 단순 패턴 (phase 2의 `post get`과 동일):
```
.argument("[project]", "...")
.argument("[post-number]", "...")
.option("--id <postId>", "...")
.option("--url <url>", "...")
```

### 2) `file download-all`

sub-id 없음. 동일 단순 패턴.

### 3) `file upload` — file-path 위치 인자 보존

기존:
```
.argument("<project>", "...")
.argument("<post-number>", "...")
.argument("<file-path>", "업로드할 파일 경로")
```

변경:
```
.argument("[arg1]", "프로젝트 코드, Dooray URL, 또는 (`--id`/`--url` 모드일 때) 파일 경로")
.argument("[arg2]", "업무 번호 또는 (`--id`/`--url` 모드일 때) 파일 경로")
.argument("[arg3]", "파일 경로 (positional 모드)")
.option("--id <postId>", "...")
.option("--url <url>", "...")
.option("--file <path>", "업로드할 파일 경로 (positional 대체)")
```

action 분기 (phase 3과 유사 — 변수명만 filePath):
```ts
.action(async (arg1, arg2, arg3, opts) => {
  let projectArg: string | undefined;
  let postNumberArg: string | undefined;
  let filePath: string | undefined = opts.file;

  if (opts.id || opts.url) {
    if (arg2 || arg3) {
      throw new DoorayCliError(
        "--id/--url 모드에서는 파일 경로 외 positional 인자를 받지 않습니다. --file 옵션 사용을 권장합니다.",
        EXIT_PARAM_ERROR,
      );
    }
    filePath = filePath ?? arg1;
  } else if (arg3) {
    projectArg = arg1; postNumberArg = arg2; filePath = filePath ?? arg3;
  } else if (arg1 && !arg2) {
    projectArg = arg1;
    if (!filePath) {
      throw new DoorayCliError(
        "URL/--id 모드에서는 --file 옵션이 필요합니다.",
        EXIT_PARAM_ERROR,
      );
    }
  } else {
    projectArg = arg1; postNumberArg = arg2;
    if (!filePath) {
      throw new DoorayCliError(
        "<file-path>가 필요합니다. positional 3번째 또는 --file 옵션을 사용하세요.",
        EXIT_PARAM_ERROR,
      );
    }
  }
  if (!filePath) throw new DoorayCliError("파일 경로가 필요합니다.", EXIT_PARAM_ERROR);

  const { projectId, postId } = await resolvePostInput(client, {
    projectArg, postNumberArg, idOpt: opts.id, urlOpt: opts.url,
  });
  // 기존 업로드 로직 유지 (filePath 사용)
});
```

### 4) `file download` — file-id 옵션화

기존:
```
.argument("<project>", "...")
.argument("<post-number>", "...")
.argument("<file-id>", "파일 ID")
```

변경: phase 3 `comment/edit`과 동일 패턴 — `arg1/arg2/arg3` + `--file-id` 옵션. 다른 옵션(`--out` 등 기존)은 무변경.

### 5) `file delete` — file-id 옵션화

`file download`와 동일 패턴.

## 작업 목록 (5개)

각 파일 변경:
1) `file/list.ts` — `--id`/`--url` 추가 (단순)
2) `file/download-all.ts` — `--id`/`--url` 추가 (단순)
3) `file/upload.ts` — 3-arg + `--file` 옵션 (file-path 보존)
4) `file/download.ts` — 3-arg + `--file-id` 옵션
5) `file/delete.ts` — 3-arg + `--file-id` 옵션

> 작업 항목 5개 = CLAUDE.md "5 이하" 룰 한도. 추가 항목 금지.

## 성공 기준

- [ ] `pnpm build` 성공
- [ ] `pnpm test` 통과
- [ ] 5개 명령 `--help`에 `--id`, `--url` 노출. download/delete는 `--file-id`, upload는 `--file` 노출
- [ ] `grep -c "resolvePostInput" src/commands/post/file/*.ts` → 5
- [ ] 기존 호출 호환:
  - `dooray post file list tc-ocr 337` 동작
  - `dooray post file download tc-ocr 337 file-abc` 동작 (수동, phase 5)
  - `dooray post file upload tc-ocr 337 ./report.pdf` 동작 (phase 5)
- [ ] 신규 호출:
  - `dooray post file upload --id 12345 --file ./report.pdf` 동작 (phase 5)
  - `dooray post file download --id 12345 --file-id file-abc` 동작 (phase 5)

## 주의사항

- **upload의 파일 경로 보존이 핵심** — 다른 옵션(`--out`, `--overwrite` 등 기존)은 절대 건드리지 않음
- **--file 옵션은 upload 전용** (download는 `--file-id`로 의미 구분)
- **3-arg 분기 패턴은 phase 3과 동일** — 변수명만 다름. 복사 후 변수만 변경
- **commander option key는 camelCase**: `--file-id` → `opts.fileId`, `--file` → `opts.file`

## Blocked 조건

- phase 1-3 산출물 부재 → `PHASE_BLOCKED: 의존 phase 미완료`
- 3-arg 분기 패턴이 upload/download/delete에서 동작 안 함 → `PHASE_BLOCKED: 시그니처 재설계`
