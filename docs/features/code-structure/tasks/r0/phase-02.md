# Phase 02. 구조 ADR 과 구조 문서

**Execution profile**: standard

## 목표

목표 구조와 의존 규칙을 문서의 현재 원본으로 올리고, 대체되는 두 ADR 을 이력으로 돌린다.

**범위 외**: 다른 ADR 의 `src/…` 경로 수정(이동 PR 이 이동 스크립트로 고친다), 지난 기능 계획서의 낡은 경로.

## 컨텍스트

**요구사항**: REQ5, REQ6

**근거 문서**: `docs/features/code-structure/spec.md`, `docs/features/code-structure/design.md`

ADR 양식은 `docs/adr/081-web-session-auth.md` 의 머리 항목(status, decision-type, areas, 현재 규칙의 원본, 결정, 맥락, 대안 기각, 결과, 확인 방법)을 따른다.

## 의도 메모

- 대체된 ADR 은 지우지 않고 `docs/adr/superseded/` 로 옮겨 `status: superseded` 와 결정 바로 아래 「대체된 부분」 을 단다. 옮긴 파일을 가리키던 링크를 같은 커밋에서 고친다.
- `docs/code-architecture.md` 는 정리가 여러 PR 에 걸치므로 「지금」 과 「목표」 를 나눠 적고, 정리가 끝나면 「지금」 을 지운다.

## 작업 항목

### 1. ADR

`docs/adr/082-code-structure.md` 를 새로 쓴다. `docs/adr/014-ts-path-alias-deferred.md`, `docs/adr/017-api-types-single-file.md` 를 `docs/adr/superseded/` 로 옮기고 대체 표시를 단다. `docs/adr/INDEX.md` 에 ADR-082 행을 더하고 두 행을 「대체됨」 절로 옮긴다.

### 2. 구조 문서

`docs/code-architecture.md` 의 디렉터리 구조를 지금·목표로 나누고, 「모듈 의존 관계」 를 규칙 표가 있는 「의존 규칙」 으로 바꾸며, import 경로와 구조 정리 도구 절을 더한다. `CLAUDE.md` 코드 컨벤션에 별칭과 의존 규칙 한 줄을 더한다. 스펙 「배경」 의 git 밖 기록 줄을 지우고 진단 근거는 design.md 「진단」 에 둔다.

## 검증

```bash
node scripts/check-pii.mjs
node scripts/check-public-refs.mjs
node scripts/check-doc-paths.mjs
pnpm exec vitest run src/architecture.test.ts
```

모두 종료 코드 0 이어야 한다. ADR 링크 검사는 technical-design 스킬의 `adr-docs.ts check` 로 PR 안 위반 0건을 확인한다.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `docs/adr/082-code-structure.md` | 신규 |
| `docs/adr/superseded/014-ts-path-alias-deferred.md` | 신규 (`docs/adr/014-ts-path-alias-deferred.md` 를 옮기고 대체 표시) |
| `docs/adr/014-ts-path-alias-deferred.md` | 삭제 (옮김) |
| `docs/adr/superseded/017-api-types-single-file.md` | 신규 (`docs/adr/017-api-types-single-file.md` 를 옮기고 대체 표시) |
| `docs/adr/017-api-types-single-file.md` | 삭제 (옮김) |
| `docs/adr/INDEX.md` | 수정 |
| `docs/code-architecture.md` | 수정 |
| `CLAUDE.md` | 수정 |
| `docs/features/code-structure/spec.md` | 수정 (배경 한 줄 삭제) |
| `docs/features/code-structure/design.md` | 신규 |
