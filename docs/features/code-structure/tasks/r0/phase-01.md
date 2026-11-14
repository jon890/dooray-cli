# Phase 01. 검사 도구와 경로 별칭

**Execution profile**: standard

## 목표

R1~R4 가 동작 불변을 보이고 구조가 다시 섞이지 않게 막을 도구 넷을 들인다: 의존 규칙 테스트, 도움말 스냅숏 스크립트, 경로 별칭, 문서 경로 검사 스크립트.

**범위 외**: 파일 이동과 분할(R1~R5), CI 단계 추가(규칙 테스트는 `pnpm test` 안에서 돈다), `package.json` 스크립트 추가.

## 컨텍스트

**요구사항**: REQ1, REQ5, REQ6, REQ7

**근거 문서**: `docs/features/code-structure/spec.md`, `docs/features/code-structure/design.md`, `docs/adr/082-code-structure.md`, `docs/adr/048-checks-to-mjs.md`

스크립트는 `node:` 빌트인만 쓰는 `.mjs` 이고 짝 테스트 `*.test.mjs` 를 `scripts/` 에 둔다. 기존 `scripts/check-public-refs.mjs` 의 꼴(머리 주석에 사용법과 종료 코드, 함수 export, 직접 실행일 때만 main)을 따른다.

## 의도 메모

- 규칙 검사에 dependency-cruiser 같은 의존성을 더하지 않는다. import 지정자 정규식으로 충분하고, 수집 건수 하한으로 조용한 실패를 막는다.
- 도움말 스냅숏 기준 파일은 저장소에 두지 않는다. 기능 PR 마다 기준을 고치는 부담을 피한다.
- 별칭은 `index.ts` 의 import 하나만 바꾼다. 빌드가 별칭을 푸는지 `dist/index.js --version` 으로 보이기 위한 최소 변경이다.

## 작업 항목

### 1. `src/architecture.test.ts`

design.md 「의존 규칙」 표를 `LAYER_DEPENDENCIES` 상수로, 계층 안 규칙(명령 영역 사이, 공개·웹 구현 사이, api 영역 사이)을 `violationOf(edge)` 로 옮긴다. `*.test.ts`·`fixtures/` 를 뺀 `src/**/*.ts` 의 import 를 읽어 상대 경로와 `@/` 를 src 기준 경로로 풀고, 위반을 `ALLOWED_VIOLATIONS` 와 양방향으로 비교한다. 수집 import 가 500건 아래면 실패한다. 판정 함수 단위 테스트를 같은 파일에 둔다.

### 2. 경로 별칭

`tsconfig.json` `compilerOptions.paths` 에 `"@/*": ["./src/*"]`, `vitest.config.ts` 에 `resolve.tsconfigPaths: true`. `src/index.ts` 의 `./version.js` import 를 `@/version.js` 로. `src/path-alias.test.ts` 가 별칭·상대 경로가 같은 모듈인지와 `vi.mock("@/…")` 가 상대 경로 import 에 적용되는지 본다.

### 3. `scripts/help-snapshot.mjs`

빈 임시 HOME, `NO_COLOR=1`, `COLUMNS=120` 으로 `node <bin> … --help` 를 「Commands:」 절을 따라 깊이 우선으로 돌며 모은다. `--out`, `--check <기준>`(다르면 처음 어긋난 줄과 종료 코드 1). `parseSubcommands`·`collectHelp`·`renderSnapshot`·`firstDifference` 를 export 하고 `scripts/help-snapshot.test.mjs` 로 검사한다.

### 4. `scripts/check-doc-paths.mjs`

`docs/`, `CLAUDE.md`, `README.md`, `CONTRIBUTING.md`, `.claude/`, `skills/` 의 Markdown 에서 `src/…` 경로를 뽑아 없는 파일을 `<문서>:<줄>: <경로>` 로 낸다. 기본 종료 코드 0, `--strict` 면 1. `scripts/check-doc-paths.test.mjs` 로 검사한다.

## 검증

```bash
pnpm exec vitest run src/architecture.test.ts src/path-alias.test.ts scripts/help-snapshot.test.mjs scripts/check-doc-paths.test.mjs
pnpm tsc --noEmit
pnpm run build
node dist/index.js --version
node scripts/help-snapshot.mjs --out "$TMPDIR/help-branch.txt"
node scripts/check-doc-paths.mjs
node scripts/check-pii.mjs
node scripts/check-public-refs.mjs
```

모두 종료 코드 0 이어야 한다. `--version` 은 `package.json` 의 버전과 같아야 한다.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `src/architecture.test.ts` | 신규 |
| `src/path-alias.test.ts` | 신규 |
| `src/index.ts` | 수정 (version import 를 별칭으로) |
| `tsconfig.json` | 수정 (paths) |
| `vitest.config.ts` | 수정 (resolve.tsconfigPaths) |
| `scripts/help-snapshot.mjs` | 신규 |
| `scripts/help-snapshot.test.mjs` | 신규 |
| `scripts/check-doc-paths.mjs` | 신규 |
| `scripts/check-doc-paths.test.mjs` | 신규 |
