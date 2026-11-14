# Phase 02. project·post·wiki·mail 명령 나무를 영역에서 내보낸다

**Execution profile**: standard

## 목표

`commands/{project,post,wiki,mail}/index.ts` 가 영역 명령 나무를 내보내고 `src/index.ts` 는 붙이기만 한다. 등록 순서를 지킨다.

**범위 외**: 명령 이름·옵션 변경.

## 컨텍스트

**요구사항**: REQ1

member·messenger·stream·calendar 의 `export const <영역>Command = new Command(…)` 꼴을 따른다. post 의 comment·file 묶음은 각 폴더의 index.ts 가 맡는다.

**근거 문서**: `docs/features/code-structure/design.md`

## 작업 항목

### 네 영역의 `index.ts` 를 만들고 `src/index.ts` 의 조립 코드를 옮긴다.
### 하위 명령 이름과 순서를 `src/commands/command-trees.test.ts` 로 확인한다.

## 검증

```bash
pnpm tsc --noEmit
pnpm vitest run src/commands/command-trees.test.ts
pnpm run build
node scripts/help-snapshot.mjs --check <기준 스냅숏>
```

## 변경 파일

| 파일 | 변경 |
| --- | --- |
| `src/commands/project/index.ts` | 신규 |
| `src/commands/post/index.ts` | 신규 |
| `src/commands/post/comment/index.ts` | 신규 |
| `src/commands/post/file/index.ts` | 신규 |
| `src/commands/wiki/index.ts` | 신규 |
| `src/commands/mail/index.ts` | 신규 |
| `src/index.ts` | 수정 |
| `src/commands/command-trees.test.ts` | 신규 |
