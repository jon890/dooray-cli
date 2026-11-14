# Phase 04. 문서의 낡은 경로를 고치고 CI 에 검사를 더한다

**Execution profile**: standard

## 목표

`node scripts/check-doc-paths.mjs --strict` 가 0건이 되게 문서의 낡은 `src/…` 경로를 고치고 CI 에 단계를 더한다.

**범위 외**: 코드 변경.

## 컨텍스트

**요구사항**: REQ7

낡은 경로는 웹 세션 계획 문서 네 개의 12건이었다. 지금 있는 파일로 고친다.

**근거 문서**: `docs/features/code-structure/design.md`

## 작업 항목

### 낡은 경로 12건을 지금 파일로 바꾼다.
### `.github/workflows/ci.yml` 에 `--strict` 단계를 더한다.
### 구조 정리 도구 표와 R4 설계 문서를 갱신한다.

## 검증

```bash
pnpm test
node scripts/check-doc-paths.mjs --strict
```

## 변경 파일

| 파일 | 변경 |
| --- | --- |
| `docs/features/web-session-auth/tasks/collab/phase-01.md` | 수정 (경로만) |
| `docs/features/web-session-auth/tasks/collab/phase-02.md` | 수정 (경로만) |
| `docs/features/web-session-auth/tasks/project-member/phase-02.md` | 수정 (경로만) |
| `docs/features/web-session-auth/tasks/project-member/phase-03.md` | 수정 (경로만) |
| `.github/workflows/ci.yml` | 수정 |
| `docs/code-architecture.md` | 수정 |
| `docs/features/code-structure/design.md` | 수정 |
