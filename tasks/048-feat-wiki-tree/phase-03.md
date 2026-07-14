# Phase 03 — 트리 조립 로직 단위 테스트 + 빌드/타입체크 검증

**Model**: sonnet
**Status**: pending

---

## 목표

phase-02 의 순수 함수 `buildWikiTree` / `renderWikiTree` 를 vitest 단위 테스트로 검증한다.
재귀 조립·정렬·엣지 케이스가 회귀 없이 동작함을 고정한다.

**범위 외**: API 실제 호출(client) 은 테스트 대상 아님 — 순수 함수만. README/SKILL 은 phase-04.

---

## 작업 항목 (2)

### 1. `src/formatters/wiki.test.ts` — buildWikiTree / renderWikiTree 테스트

기존 테스트 스타일 참조: `src/commands/wiki/page-comment/parse-args.test.ts`, `src/formatters/wiki-comment.test.ts`.
vitest (`describe`/`it`/`expect`) 사용. `WikiPage` 픽스처는 인라인 리터럴로 구성.

**픽스처 식별자 규칙**: 실제 19자리 사내 ID·실명·사내 프로젝트 코드 금지.
`"p-root"`, `"p-child-1"` 같은 더미 문자열 id + `"Home"`, `"자식 A"` 같은 가상 제목 사용
(pitfall: src-test-fixture-internal-identifier).

`buildWikiTree` 케이스:

- **flat → 트리 조립**: root 1개 + 자식 2개 + 손자 1개 → 중첩 구조가 부모-자식으로 정확히 조립.
- **다중 루트**: `root: true` 페이지 2개 → 최상단 노드 2개.
- **고아 parentPageId**: `parentPageId` 가 배열 내 어떤 id 에도 없는 페이지 → 루트로 승격.
- **빈 배열**: `[]` 입력 → `[]` 반환.

`renderWikiTree` 케이스:

- **커넥터**: 자식 2개 중 첫 형제 `├─`, 마지막 `└─`.
- **id 노출**: 각 라인에 `(<id>)` 포함.
- **subject 개행 정규화**: `subject` 에 `\n` 포함 시 한 줄로 렌더 (개행이 트리 구조를 깨지 않음).

### 2. 빌드 + 타입체크 + 테스트 실행 검증

phase-01/02 산출물이 빌드·타입·테스트를 통과하는지 확인한다.

---

## Critical Files

| 파일 | 변경 |
|---|---|
| `src/formatters/wiki.test.ts` | 신규 — buildWikiTree/renderWikiTree 테스트 |

## 검증

```bash
# cwd: /Users/nhn/personal/dooray-cli
pnpm tsc --noEmit
# 0 에러

pnpm test -- wiki
# 신규 wiki.test.ts 통과 (기존 wiki-comment.test.ts 포함 회귀 0)

pnpm run build
# 빌드 성공
```

## 의도 메모 (왜)

- 순수 함수(build/render)만 테스트해 I/O·네트워크 의존 없이 트리 로직을 고정 (pitfall: io-and-throw-coupled-untestable 회피가 phase-02 에서 선행됐기에 가능).
- 고아 parentPageId·다중 루트 케이스는 실제 위키에서 발생 가능 (권한으로 중간 페이지 누락 등) — 방어적 조립을 테스트로 고정.
